'use strict';

/* Global variables below */
//Debug stuff(sliders, text)
/*var walking_status_div = document.getElementById("walking_status");
var stddev_div = document.getElementById("stddev");
var stddev_accel_div = document.getElementById("stddev_accel");
var fftindex_div = document.getElementById("fft_index");
var rw_div = document.getElementById("rewind_status");
var sliderDiv = document.getElementById("sliderAmount");
//Sliders
var slider_stddev = document.getElementById("slider_stddev");
var slider_stddev_div = document.getElementById("slider_stddev_amount");
slider_stddev.onchange = () => {
        ALGORITHM.stddevthreshold = slider_stddev.value;
        slider_stddev_div.innerHTML = ALGORITHM.stddevthreshold;
        console.log("Std dev threshold:", ALGORITHM.stddevthreshold);
};
var slider_stepamt = document.getElementById("slider_stepamt");
var slider_stepamt_div = document.getElementById("slider_stepamt_amount");
slider_stepamt.onchange = () => {
        ALGORITHM.stepamt = slider_stepamt.value;
        ALGORITHM.amtStepValues = ALGORITHM.stepamt*sensorfreq;     //recalculate
        slider_stepamt_div.innerHTML = ALGORITHM.stepamt;
        console.log("Step amount:", ALGORITHM.stepamt);
};
var slider_bias = document.getElementById("slider_bias");
var slider_bias_div = document.getElementById("slider_bias_amount");
slider_bias.onchange = () => {
        ALGORITHM.bias = slider_bias.value;
        slider_bias_div.innerHTML = ALGORITHM.bias;
        console.log("Filter bias:", ALGORITHM.bias);
};

var smoothing_value = document.getElementById("smoothing_value");
var smoothing_value_div = document.getElementById("smoothing_amount");
smoothing_value.onchange = () => {
        ALGORITHM.smoothingvalue = smoothing_value.value;
        smoothing_value_div.innerHTML = ALGORITHM.smoothingvalue;
        console.log("Smoothing value:", ALGORITHM.smoothingvalue);
};
*/
var accel = {x:null, y:null, z:null};
var rewinding = false;
var reading;    //Variable for controlling the data reading loop
//var ut; //debug text update var
const GRAVITY = 9.81;
const sensorfreq = 60;  //Frequency at which the sensors read at
var stepvar = 0;     //0 when not walking, 1 when walking

//Sensors
var accel_sensor = null;
var orientation_sensor = null;

var latitude = 0;
var longitude = 0;

//The video elements, these will be referred to control video playback
var videoF = null;
var videoB = null;
var video = null;       //This will always be the currently playing video

//Rendering vars (Three.JS)
var scene = null;
var sphere = null;
var videoTexture = null;
var sphereMaterial = null;
var sphereMesh = null;
var camera = null;
const cameraConstant = 200;
var renderer = null;

//Service worker registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
  navigator.serviceWorker.register('sw.js').then(function(registration) {
      //Registration was successful
    }, function(err) {
      //Registration failed
      console.log('ServiceWorker registration failed: ', err);
    });
  });
}

//Sensor classes and low-pass filter

//This is a sensor that uses Accelerometer and returns the acceleration along the three axes
class Pedometer {
        constructor() {
        this.sensor_ = new Accelerometer({ frequency: sensorfreq });
        this.accel_ = 0;
        this.sensor_.onreading = () => {
                this.accel_ = {'x':this.sensor_.x, 'y':this.sensor_.y, 'z':this.sensor_.z};
                if (this.onreading_) this.onreading_();
        };
        }
        start() { this.sensor_.start(); }
        stop() { this.sensor_.stop(); }
        get accel() {
                return this.accel_;
        }
        set onactivate(func) {
                this.sensor_.onactivate_ = func;
        }
        set onerror(err) {
                this.sensor_.onerror_ = err;
        }
        set onreading (func) {
                this.onreading_ = func;  
        }
}

//This is a sensor that uses RelativeOrientationSensor and converts the quaternion to Euler angles
class OriSensor {
        constructor() {
        this.sensor_ = new RelativeOrientationSensor({ frequency: sensorfreq });
        this.x_ = 0;
        this.y_ = 0;
        this.z_ = 0;
        this.longitudeInitial_ = 0;
        this.initialoriobtained_ = false;
        this.sensor_.onreading = () => {
                let quat = this.sensor_.quaternion;
                let quaternion = new THREE.Quaternion();        //Conversion to Euler angles done in THREE.js so we have to create a THREE.js object for holding the quaternion to convert from
                let euler = new THREE.Euler( 0, 0, 0);  //Will hold the Euler angles corresponding to the quaternion
                quaternion.set(quat[0], quat[1], quat[2], quat[3]);     //x,y,z,w
                //Coordinate system must be adapted depending on orientation
                if(screen.orientation.angle === 0)      //portrait mode
                {
                euler.setFromQuaternion(quaternion, 'ZYX');     //ZYX works in portrait, ZXY in landscape
                }
                else if(screen.orientation.angle === 90 || screen.orientation.angle === 180 || screen.orientation.angle === 270)        //landscape mode
                {
                euler.setFromQuaternion(quaternion, 'ZXY');     //ZYX works in portrait, ZXY in landscape
                }
                this.x_ = euler.x;
                this.y_ = euler.y;
                this.z_ = euler.z;
                if(!this.initialoriobtained_) //obtain initial longitude - needed to make the initial camera orientation the same every time
                {
                        this.longitudeInitial_ = -this.z_;
                        if(screen.orientation.angle === 90)
                        {
                                this.longitudeInitial_ = this.longitudeInitial_ + Math.PI/2;     //offset fix
                        }
                        this.initialoriobtained_ = true;
                }
                if (this.onreading_) this.onreading_();
        };
        }
        start() { this.sensor_.start(); }
        stop() { this.sensor_.stop(); }
        get x() {
                return this.x_;
        }
        get y() {
                return this.y_;
        } 
        get z() {
                return this.z_;
        }
        get longitudeInitial() {
                return this.longitudeInitial_;
        }
        set onactivate(func) {
                this.sensor_.onactivate_ = func;
        }
        set onerror(err) {
                this.sensor_.onerror_ = err;
        }
        set onreading (func) {
                this.onreading_ = func;  
        }
}
class LowPassFilterData {       //https://w3c.github.io/motion-sensors/#pass-filters
  constructor(reading, bias) {
    Object.assign(this, { x: reading.x, y: reading.y, z: reading.z });
    this.bias = bias;
  }
        update(reading) {
                this.x = this.x * this.bias + reading.x * (1 - this.bias);
                this.y = this.y * this.bias + reading.y * (1 - this.bias);
                this.z = this.z * this.bias + reading.z * (1 - this.bias);
        }
}

//Functions for the debug text and sliders

/*function updateSlider(slideAmount)
{
alert("error");
sliderDiv.innerHTML = slideAmount;
}

function updateText()   //For updating debug text
{
        if(stepvar)
        {
                walking_status_div.innerHTML = "Walking";
        }
        else if (!stepvar)
        {
                walking_status_div.innerHTML = "Not walking";
        }
        rw_div.innerHTML = rewinding;
        stddev_div.innerHTML = ALGORITHM.stddevpct;
        stddev_accel_div.innerHTML = ALGORITHM.stddev_accel;
        fftindex_div.innerHTML = ALGORITHM.fft_index;
}*/

function startDemo() {  //Need user input to play video, so here both the forward and the backward video are played and paused once in order to satisfy that requirement
        videoF.play().then(function(value){
                videoF.pause();
});
        videoB.play().then(function(value){
                videoB.pause();
});
        document.getElementById("startbutton").remove();     //Hide button
        reading = setInterval(ALGORITHM.saveSensorReading, 1000/sensorfreq);     //Start saving data from sensors in loop
}

//The custom element where the video will be rendered
customElements.define("video-view", class extends HTMLElement {
        constructor() {
                super();

                //Set up two video elements, one forward and one backward, switching between them when the user changes walking direction
                videoF = document.createElement("video");
                videoF.src = "resources/forward2.mp4";
                videoF.crossOrigin = "anonymous";
                videoF.load();

                videoB = document.createElement("video");
                videoB.src = "resources/backward2.mp4";
                videoB.crossOrigin = "anonymous";
                videoB.load();

                //THREE.js scene setup
                renderer = new THREE.WebGLRenderer();
                renderer.setSize(window.innerWidth, window.innerHeight);
                document.body.appendChild(renderer.domElement);
                scene = new THREE.Scene();
                cameraConstant = 200;
                camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, cameraConstant);
                camera.target = new THREE.Vector3(0, 0, 0);
                sphere = new THREE.SphereGeometry(100, 100, 40);
                sphere.applyMatrix(new THREE.Matrix4().makeScale(-1, 1, 1));    //The sphere is transformed because the the video will be rendered on the inside surface

                video = videoF; //Start with the forward video
                video.load();
                videoTexture = new THREE.Texture(video);
                videoTexture.minFilter = THREE.LinearFilter;
                videoTexture.magFilter = THREE.LinearFilter;
                videoTexture.format = THREE.RGBFormat;

                sphereMaterial = new THREE.MeshBasicMaterial( { map: videoTexture, overdraw: 0.5 } );
                sphereMesh = new THREE.Mesh(sphere, sphereMaterial);
                scene.add(sphereMesh);
                sphereMesh.rotateY(Math.PI+0.1);        //Rotate the projection sphere to align initial orientation with the path

                window.addEventListener( 'resize', onWindowResize, false );     //On window resize, also resize canvas so it fills the screen

                function onWindowResize() {
                        camera.aspect = window.innerWidth / window.innerHeight;
                        camera.updateProjectionMatrix();
                        renderer.setSize(window.innerWidth, window.innerHeight);
                }

        }

        connectedCallback() {
                try {
                        //Initialize sensors
                        accel_sensor = new Pedometer();
                        accel_sensor.onreading = () => {
                                accel = accel_sensor.accel;     //Save to external variable probably unnecessary
                        };
                        accel_sensor.start();
                        orientation_sensor = new OriSensor();
                        orientation_sensor.start();
                        }
                catch(err) {
                        console.log(err.message);
                        console.log("Your browser doesn't seem to support generic sensors. If you are running Chrome, please enable it in about:flags.");
                        this.innerHTML = "Your browser doesn't seem to support generic sensors. If you are running Chrome, please enable it in about:flags";
                }
                this.render();
        }

        //Calculates the direction the user is viewing in terms of longitude and latitude and renders the scene
        render() {
                if( video.readyState === video.HAVE_ENOUGH_DATA ) {
                        videoTexture.needsUpdate = true;
                }
                //When the device orientation changes, that needs to be taken into account when reading the sensor values by adding offsets, also the axis of rotation might change
                switch(screen.orientation.angle) {
                        default:
                        case 0:
                                longitude = -orientation_sensor.z - orientation_sensor.longitudeInitial;
                                latitude = orientation_sensor.x - Math.PI/2;
                                break;
                        case 90:
                                longitude = -orientation_sensor.z - orientation_sensor.longitudeInitial + Math.PI/2;
                                latitude = -orientation_sensor.y - Math.PI/2;
                                break;
                        case 270:
                                longitude = -orientation_sensor.z - orientation_sensor.longitudeInitial - Math.PI/2;
                                latitude = orientation_sensor.y - Math.PI/2;
                                break;
                }
                if(longitude < 0)       //When the user changes direction and the video changes, the heading is inverted - this is easier than rendering the video differently on the sphere, could also rotate sphere by pi?
                {
                        longitude = longitude + 2*Math.PI;
                }
                camera.target.x = (cameraConstant/2) * Math.sin(Math.PI/2 - latitude) * Math.cos(longitude);
                camera.target.y = (cameraConstant/2) * Math.cos(Math.PI/2 - latitude);
                camera.target.z = (cameraConstant/2) * Math.sin(Math.PI/2 - latitude) * Math.sin(longitude);
                camera.lookAt(camera.target);

                renderer.render(scene, camera);
                requestAnimationFrame(() => this.render());
        }
});

/* The video playback control */
var CONTROL = (function () {
	var ctrl = {};

        //Functions related to controlling video playback - uses promises so might not work in all browsers
        function play() //redundant to put a one-liner in its own function?
        {
                rewinding ? videoB.play() : videoF.play();    
        }

	ctrl.playPause = function () //redundancy?
        {
                if(stepvar)
                {
                        play();
                }
                else
                {
                        if(!video.paused)
                        {
                                video.pause();
                        }
                }
        };

        ctrl.changeDirection = function () {     //Called when the video direction needs to be changed (F to B or B to F)
                //TODO: fix up this function (optimize as well as possible)
               if(!rewinding)   //Forward
                {
                        let time = videoF.currentTime;
                        videoF.pause();
                        video = videoB;
                        videoB.currentTime = videoB.duration - time;
                        videoTexture = new THREE.Texture(videoB);
                        videoTexture.minFilter = THREE.LinearFilter;
                        videoTexture.magFilter = THREE.LinearFilter;
                        videoTexture.format = THREE.RGBFormat;
                        videoTexture.needsUpdate = true;
                        sphereMaterial = new THREE.MeshBasicMaterial( { map: videoTexture, overdraw: 0.5 } );
                        sphereMesh.material = sphereMaterial;
                        sphereMaterial.needsUpdate = true;
                        rewinding = true;
                }
                else    //Backward
                {
                        let time = videoB.currentTime;
                        videoB.pause();
                        video = videoF;
                        videoF.currentTime = videoF.duration - time;
                        videoTexture = new THREE.Texture(videoF);
                        videoTexture.minFilter = THREE.LinearFilter;
                        videoTexture.magFilter = THREE.LinearFilter;
                        videoTexture.format = THREE.RGBFormat;
                        videoTexture.needsUpdate = true;
                        sphereMaterial = new THREE.MeshBasicMaterial( { map: videoTexture, overdraw: 0.5 } );
                        sphereMesh.material = sphereMaterial;
                        sphereMaterial.needsUpdate = true;
                        rewinding = false;
                }
        };
	return ctrl;
}());
