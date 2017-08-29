/*
*       360 degree video demo
*/

'use strict';

//Sensor classes and low-pass filter

//This is a sensor that uses Accelerometer and returns the acceleration along the three axes
class Pedometer {
        constructor(options) {
        this.sensor_ = new Accelerometer(options);
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

// This is an inclination sensor that uses RelativeOrientationSensor
// and converts the quaternion to Euler angles
class OriSensor extends RelativeOrientationSensor{
    constructor(options) {
        super(options);
        this.longitude_ = 0;
        this.latitude_ = 0;
        this.longitudeInitial_ = 0;
        this.initialOriObtained_ = false;
    }

    set onreading(func) {
        super.onreading = () => {
            // Conversion to Euler angles done in THREE.js so we have to create a
            // THREE.js object for holding the quaternion to convert from
            // Order x,y,z,w
            let quaternion = new THREE.Quaternion(super.quaternion[0], super.quaternion[1], super.quaternion[2], super.quaternion[3]);
            // euler will hold the Euler angles corresponding to the quaternion
            let euler = new THREE.Euler(0, 0, 0);  
            // Order of rotations must be adapted depending on orientation
            // for portrait ZYX, for landscape ZXY
            let angleOrder = null;
            screen.orientation.angle === 0 ? angleOrder = 'ZYX' : angleOrder = 'ZXY';
            euler.setFromQuaternion(quaternion, angleOrder);
            if(!this.initialOriObtained_) {
                // Initial longitude needed to make the initial camera orientation
                // the same every time
                this.longitudeInitial_ = -euler.z;
                if(screen.orientation.angle === 90) {
                    this.longitudeInitial_ = this.longitudeInitial_ + Math.PI/2;
                }
                this.initialOriObtained_ = true;
            }

            // Device orientation changes need to be taken into account
            // when reading the sensor values by adding offsets
            // Also the axis of rotation might change
            switch(screen.orientation.angle) {
                default:
                case 0:
                    this.longitude_ = -euler.z - this.longitudeInitial_;
                    this.latitude_ = euler.x - Math.PI/2;
                    break; 
                case 90:
                    this.longitude_ = -euler.z - this.longitudeInitial_ + Math.PI/2;
                    this.latitude_ = -euler.y - Math.PI/2;                 
                    break;     
                case 270:
                    this.longitude_ = -euler.z - this.longitudeInitial_ - Math.PI/2;
                    this.latitude_ = euler.y - Math.PI/2;
                    break;
            }
            func();
        };      
    }

    get longitude() {
        return this.longitude_;
    }

    get latitude() {
        return this.latitude_;
    }
}

/* Global variables below */

var accel = {x:null, y:null, z:null};
var rewinding = false;
var reading;    //Variable for controlling the data reading loop
const GRAVITY = 9.81;
const sensorfreq = 60;  //Frequency at which the sensors read at
var stepvar = 0;     //0 when not walking, 1 when walking

//Sensors
var accel_sensor = null;
var orientation_sensor = new OriSensor({frequency: 60});
orientation_sensor.onreading = render;

//The video elements, these references will be used to control video playback
var videoF = null;
var videoB = null;
var video = null;       //This will always be the currently playing video

// Required for a THREE.js scene
var camera, scene, renderer;
var sphere = null;
var videoTexture = null;
var sphereMaterial = null;
var sphereMesh = null;
const cameraConstant = 200;

var longitude = 0;
var latitude = 0;

// Service worker registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        navigator.serviceWorker.register('sw.js').then(function(registration) {
        }, function(err) {
        console.log('ServiceWorker registration failed: ', err);
        });
    });
}

function startDemo() {  //Need user input to play video, so here both the forward and the backward video are played and paused once in order to satisfy that requirement
        videoF.play().then(function(value) {
                videoF.pause();
});
        videoB.play().then(function(value) {
                videoB.pause();
});
        document.getElementById("startbutton").remove();     //Hide button
        reading = setInterval(ALGORITHM.saveSensorReading, 1000/sensorfreq);     //Start saving data from sensors in loop
}

//Calculates the direction the user is viewing in terms of longitude and latitude and renders the scene
function render() {
    if(video.readyState === video.HAVE_ENOUGH_DATA) {
        videoTexture.needsUpdate = true;
    }
    camera.target.x = (cameraConstant/2) * Math.sin(Math.PI/2 - orientation_sensor.latitude) * Math.cos(orientation_sensor.longitude);
    camera.target.y = (cameraConstant/2) * Math.cos(Math.PI/2 - orientation_sensor.latitude);
    camera.target.z = (cameraConstant/2) * Math.sin(Math.PI/2 - orientation_sensor.latitude) * Math.sin(orientation_sensor.longitude);
    camera.lookAt(camera.target);

    renderer.render(scene, camera);
}

// The main loop, ran each time the sensor gets a new reading
function loop() {
}
// The custom element where the video will be rendered
customElements.define("video-view", class extends HTMLElement {
        constructor() {
                super();

                // Set up two video elements, one forward and one backward, switching between them when the user changes walking direction
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

                // On window resize, also resize canvas so it fills the screen
                window.addEventListener('resize', () => {
                        camera.aspect = window.innerWidth / window.innerHeight;
                        camera.updateProjectionMatrix();
                        renderer.setSize(window.innerWidth, window.innerHeight);
                }, false);

        }

        connectedCallback() {
                try {
                        //Initialize sensors
                        // Pedometer used in walking detection algorithm
                        accel_sensor = new Pedometer({ frequency: sensorfreq });
                        accel_sensor.onreading = () => {
                                accel = accel_sensor.accel;     //Save to external variable probably unnecessary
                        };
                        accel_sensor.start();
                        orientation_sensor.start();
                        }
                catch(err) {
                        console.log(err.message);
                        console.log("Your browser doesn't seem to support generic sensors. If you are running Chrome, please enable it in about:flags.");
                        this.innerHTML = "Your browser doesn't seem to support generic sensors. If you are running Chrome, please enable it in about:flags";
                }
                render();
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
                //sphereMesh.rotateY(2*Math.PI);
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

