'use strict';

/* Global variables below */
//Debug stuff(sliders, text)
var walking_status_div = document.getElementById("walking_status");
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
        amtStepValues = ALGORITHM.stepamt*sensorfreq;     //recalculate
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

var accel = {x:null, y:null, z:null};
var rewinding = false;
var reading;    //variable for controlling the data reading loop
var ut; //debug text update var
const GRAVITY = 9.81;
var orientationMat = new Float64Array([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]);     //device orientation
var sensorfreq = 60;
var stepvar = 0;     //0 when not walking, 1 when walking

//Sensors
var accel_sensor = null;
var orientation_sensor = null;

var latitude;
var longitude;

//Rendering vars (Three.JS)
var scene = null;
var sphere = null;
var video = null;
var videoF = null;
var videoB = null;
var videoTexture = null;
var sphereMaterial = null;
var sphereMesh = null;
var camera = null;
var cameraConstant = 200;
var renderer = null;


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

function updateSlider(slideAmount)
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
}

function startDemo() {  //Need user input to play video, so here both the forward and the backward video are played and paused in order to satisfy that requirement
        videoF.play();
        videoB.play();
        videoF.pause();
        videoB.pause();
        document.getElementById("startbutton").remove();     //Hide button
        reading = setInterval(ALGORITHM.saveSensorReading, 1000/sensorfreq);     //Start saving data from sensors in loop
}

//The custom element where the video will be rendered
customElements.define("video-view", class extends HTMLElement {
        constructor() {
        super();

        //Set up two video elements, one forward and one backward, switching between them when the user changes walking direction
        videoF = document.createElement("video");
        videoF.src    = "https://raw.githubusercontent.com/jessenie-intel/websensor-video/master/forward2.mp4";
        videoF.crossOrigin = "anonymous";

        videoB = document.createElement("video");
        videoB.src    = "https://raw.githubusercontent.com/jessenie-intel/websensor-video/master/backward2.mp4";
        videoB.crossOrigin = "anonymous";

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

        window.addEventListener( 'resize', onWindowResize, false );     //On window resize, also resize canvas so it fills the screen

        function onWindowResize() {
          camera.aspect = window.innerWidth / window.innerHeight;
          camera.updateProjectionMatrix();
          renderer.setSize( window.innerWidth , window.innerHeight);
        }

        }

        connectedCallback() {
                try {
                //Initialize sensors
                accel_sensor = new Pedometer();
                accel_sensor.onreading = () => {
                        accel = accel_sensor.accel;
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
                //TODO: fix up this function
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


/* The walking detection algorithm */
var ALGORITHM = (function () {
	var algo = {};

        var accelerationData = [];        //sequence to store xyz accelerometer readings
        var accelSeq = {x:null, y:null, z:null};      //dict to store accelerometer reading sequences
        var accelFiltered = {x:null, y:null, z:null};
        var prevaccel = {x:null, y:null, z:null};
        var diff = {x:null, y:null, z:null};
        //Thresholds and other values for the algorithm
        var stepamt = 2;      //2.5 seems to work well for walking in place, 2 with tablet, 3.5 for normal walking (Pixel)
        var amtStepValues = stepamt*sensorfreq; //setting buffer size for step analysis (how many values will be inspected) - should be about how long 2 steps will take (here stepamt seconds)
        var stepaverage = null;
        var peaktimethreshold = null;
        var valleytimethreshold = null;
        var discardedsamples = 0;
        var accdiffthreshold = 0.15;     //if acceleration changes less than this, ignore it(for removing noise)
        //In below arrays, first values for Windows tablet, second values for Nexus tablet
        var stddevthreshold = 2.8;      //0.4 good for walking in place, 2.9 with tablet, 0.3 for Pixel
        var peakvalleyamtthreshold = [2, 6, 12];        //12 for Pixel.. need to filter better
        var bias = 1; //bias for low-pass filtering the data, 1 seems to work good with the tablet
        var smoothingvalue = 8; //for smoothing out noise (extra peaks and valleys) - 8 seems to work well (6 also)
        var average_accel_nog = null;
        var stddevpct = null;
        var stddev_accel = null;
        var fft_index = null;
        var alpha = 4;

        /* Below are functions for the WD algorithm and functions used in the algorithm */

        //Functions to process data

        function toCoordSeq(buffer)     //Function to convert from sensor readings (one for each reading), to sequences (one for each coordinate)
        {
                let seq_x = [];
                let seq_y = [];
                let seq_z = [];
                for (let i=0; i<buffer.length; i++)
                {
                        seq_x.push(buffer[i].x);        
                        seq_y.push(buffer[i].y);
                        seq_z.push(buffer[i].z);
                }
                var seq = {'x':seq_x, 'y':seq_y, 'z':seq_z};
                return seq;
        }
        function slice(obj, start, end) {
            var sliced = {};
            for (var k in obj) {
                sliced[k] = obj[k].slice(start, end);
            }

            return sliced;
        }

        function magnitude(data, mode = "vector")      //Calculate the magnitude of a vector or alternatively a sequence
        {
                if(mode === "seq")      //Calculate the magnitude sequence for 3 acceleration sequences
                {
                        let magseq = [];
                        for (let k in data)
                        {
                                for (let i in data[k])
                                {
                                        magseq[i] = Math.sqrt(data.x[i] * data.x[i] + data.y[i] * data.y[i] + data.z[i] * data.z[i]);
                                }
                        }
                        return magseq;
                }
                else
                {
                        return Math.sqrt(data.x * data.x + data.y * data.y + data.z * data.z);
                }
        }

        /* Source: https://derickbailey.com/2014/09/21/calculating-standard-deviation-with-array-map-and-array-reduce-in-javascript/ */
        function standardDeviation(values){
          var avg = average(values);
          
          var squareDiffs = values.map(function(value){
            var diff = value - avg;
            var sqrDiff = diff * diff;
            return sqrDiff;
          });
          
          var avgSquareDiff = average(squareDiffs);

          var stdDev = Math.sqrt(avgSquareDiff);
          return stdDev;
        }

        function average(data){
          var sum = data.reduce(function(sum, value){
            return sum + value;
          }, 0);

          var avg = sum / data.length;
          return avg;
        } 

        /*
         *  Source: http://stevegardner.net/2012/06/11/javascript-code-to-calculate-the-pearson-correlation-coefficient/
         */
        function pcorr(x, y) {
            var shortestArrayLength = 0;
             
            if(x.length == y.length) {
                shortestArrayLength = x.length;
            } else if(x.length > y.length) {
                shortestArrayLength = y.length;
                console.error('x has more items in it, the last ' + (x.length - shortestArrayLength) + ' item(s) will be ignored');
            } else {
                shortestArrayLength = x.length;
                console.error('y has more items in it, the last ' + (y.length - shortestArrayLength) + ' item(s) will be ignored');
            }
          
            var xy = [];
            var x2 = [];
            var y2 = [];
          
            for(let i=0; i<shortestArrayLength; i++) {
                xy.push(x[i] * y[i]);
                x2.push(x[i] * x[i]);
                y2.push(y[i] * y[i]);
            }
          
            var sum_x = 0;
            var sum_y = 0;
            var sum_xy = 0;
            var sum_x2 = 0;
            var sum_y2 = 0;
          
            for(let i=0; i< shortestArrayLength; i++) {
                sum_x += x[i];
                sum_y += y[i];
                sum_xy += xy[i];
                sum_x2 += x2[i];
                sum_y2 += y2[i];
            }
          
            var step1 = (shortestArrayLength * sum_xy) - (sum_x * sum_y);
            var step2 = (shortestArrayLength * sum_x2) - (sum_x * sum_x);
            var step3 = (shortestArrayLength * sum_y2) - (sum_y * sum_y);
            var step4 = Math.sqrt(step2 * step3);
            var answer = step1 / step4;
          
            return answer;
        }
        //http://phrogz.net/js/framerate-independent-low-pass-filter.html
        // values:    an array of numbers that will be modified in place
        // smoothing: the strength of the smoothing filter; 1=no change, larger values smoothens more
        function smoothArray( values, smoothing ){
          var value = values[0]; // start with the first input
          for (let i=1, len=values.length; i<len; ++i){
            var currentValue = values[i];
            value += (currentValue - value) / smoothing;
            values[i] = value;
          }
        }

        function clearVars()    //Clear vars every loop iteration
        {
                discardedsamples = 0;
                for (var k in accelSeq) delete accelSeq[k];
                accelerationData.splice(0);
                stepaverage = null;
                peaktimethreshold = null;
                valleytimethreshold = null;
        }

        function isPeak(prev, curr, next, stepaverage, avg, variance)   //Tells if curr is a peak or not
        {
                return curr > prev && curr > next && (curr > stepaverage || !stepaverage) && curr > (avg+variance);
        }

        function isValley(prev, curr, next, stepaverage, avg, variance) //Tells if curr is a valley or not
        {
        return curr < prev && curr < next && (curr < stepaverage || !stepaverage) && curr < (avg-variance);
        }
        function detectPeaksValleys(seq)
        {
                let result = {"peaks":null, "valleys":null};
                let peakdiff = [];
                let valleydiff = [];
                let peaks = [];
                let valleys = [];
                let variance = 0.5 + standardDeviation(seq)/alpha;      //TODO: try to get rid of the constant 0,5 and make fully adaptive
                let avg = seq.reduce(function(sum, a) { return sum + a; },0)/(seq.length||1);
                for (let i in seq)
                {
                        let index = parseInt(i);
                        let prev = seq[index-1];
                        let curr = seq[index];
                        let next = seq[index+1];
                        let lastpeakmag = null;
                        let lastvalleymag = null;
                        let lastpeaktime = null;
                        let lastvalleytime = null;

                        if(isPeak(prev, curr, next, stepaverage, avg, variance))  //peak
                        {
                                //update time average regardless of peak accepted or not
                                if(peaks.length >= 2)
                                {
                                        peakdiff.push(index - lastpeaktime);
                                        let peakdiff_selected = peakdiff;  //select recent M peaks
                                        let sum = peakdiff_selected.reduce((previous, current) => current += previous); //sum over the array
                                        peaktimethreshold = sum/peakdiff.length;      //average of peak diffs
                                }
                                else
                                {
                                        if(lastpeaktime > 0 && index > lastpeaktime)
                                        {
                                                peakdiff.push(index - lastpeaktime);
                                        }
                                        else
                                        {
                                                peakdiff.push(index);
                                        }
                                }
                                peaks.push(index);
                                lastpeakmag = curr;
                                lastpeaktime = index;
                        }
                        else if(isValley(prev, curr, next, stepaverage, avg, variance))     //valley
                                {
                                //update time average regardless of valley accepted or not
                                if(valleys.length >= 2)
                                {
                                        valleydiff.push(index - lastvalleytime);
                                        let valleydiff_selected = valleydiff;    //select recent M valleys
                                        let sum = valleydiff_selected.reduce((previous, current) => current += previous); //sum over the array
                                        valleytimethreshold = sum/valleydiff.length;      //average of valley diffs
                                }
                                else
                                {
                                        if(lastvalleytime > 0 && index > lastvalleytime)
                                        {
                                                valleydiff.push(index - lastvalleytime);
                                        }
                                        else
                                        {
                                                valleydiff.push(index);
                                        }
                                }
                                valleys.push(index);
                                lastvalleymag = curr;
                                lastvalleytime = index;
                        }
                        //update step average
                        if(lastpeakmag && lastvalleymag)
                        {
                                stepaverage = (Math.abs(lastpeakmag) + Math.abs(lastvalleymag))/2.0;
                        }
                }
                result.peaks = peaks;
                result.valleys = valleys;
                return result;
        }

        function calculateFFT(seq)      //Calculates the FFT of a sequence, uses FFT.js
        {
                let real = seq.slice();
                let imag = Array.apply(null, Array(seq.length)).map(Number.prototype.valueOf,0);     //create imag array for fft computation
                transform(real, imag);  //not normalized, from FFT.js
                real = real.map(x => x/real.length);      //normalize
                imag = imag.map(x => x/imag.length);      //normalize
                let fft = [];
                for(let i=0; i< real.length; i++) {
                        fft[i] = Math.sqrt(real[i]*real[i]+imag[i]*imag[i]);    //magnitude of FFT
                }
                fft = fft.map(x => x/fft.reduce((a, b) => a + b, 0));
                return fft;
        }

        function highFreq(fft)
        {
                return fft_index > 4;
        }

        function validAccel(prevaccel, accel, accelFiltered)    //Determines if the acceleration value that was read was a valid one (device movement) instead of noise
        {
                return magnitude(prevaccel) != magnitude(accel) && Math.abs(magnitude(accelFiltered) - magnitude(prevaccel)) > accdiffthreshold;        
        }

        function needToChangeDir()      //
        {
                return (Math.abs(longitude - Math.PI) < (20 / 180) * Math.PI && rewinding == false) || ((longitude < (10 / 180) * Math.PI || longitude > (350 / 180) * Math.PI ) && rewinding == true);
        }

        //The "public interfaces" are the stepDetection and saveSensorReading functions
        //Algorithm modified from paper http://www.mdpi.com/1424-8220/15/10/27230
        var stepDetection = function (seq)      //Returns 1 if there was a step in the given acceleration sequence, otherwise 0
        {
                let magseq = magnitude(seq, "seq");     //calculate the combined magnitude sequence from the 3 distinct xyz sequences
                //Smoothen (filter noise)
                smoothArray(magseq, smoothingvalue);        //smoothens "in-place" - 8 seems to be a good value
                let peaksvalleys = null;
                let peakdiff = [];
                let valleydiff = [];
                for (var i = 0; i < magseq.length+1; i++)       //analyze sequence sample by sample - mimics real-time behavior
                {
                        peaksvalleys = detectPeaksValleys(magseq.slice(0, i));
                }
                let peaks = peaksvalleys.peaks;
                let valleys = peaksvalleys.valleys;
                //Now remove peak and valley candidates outside a pre-defined time range after each peak occurrence
                //filter the non-valid peaks and valleys out
                peaks = peaks.filter(function(n){ return n > peaktimethreshold;});
                valleys = valleys.filter(function(n){ return n > valleytimethreshold;});
                let stepdiff = [];
                for (var ipeak in peaks)
                {
                        for (var ivalley in valleys)
                        {
                                if(ipeak == ivalley)
                                {
                                        let stepdiffamt = Math.abs(peaks[ipeak] - valleys[ivalley]);
                                        if(stepdiffamt >= 10)     //at least 10 samples between peak and valley
                                        {
                                                stepdiff.push(stepdiffamt);
                                        }
                                }
                        }
                }
                let minDiff = Math.min( ...stepdiff );
                let stddev = standardDeviation(stepdiff);
                var magseqnog = magseq.map( function(value) {        //substract gravity (approx.9.81m/s^2) - probably could use filtering instead to do this
                    return value - GRAVITY;
                } );
                stddev_accel = standardDeviation(magseqnog);
                average_accel_nog = magseqnog.reduce(function(sum, a) { return sum + a; },0)/(magseqnog.length||1);     //Calculate average acceleration
                stddevpct = stddev / minDiff;

                let fft = calculateFFT(magseqnog);
                fft_index = fft.indexOf(Math.max(...fft));      //tells where the largest value in the FFT is
                if(highFreq(fft))    //definitely walking - low-frequency changes in movement most likely mean the user is moving the device to look around and not walking
                {
                        return true;
                }
                if(stepdiff.length >= Math.floor(stepamt))
                {
                        if(stddevpct < stddevthreshold && !isNaN(stddevpct) && Math.abs(peaks.length - valleys.length) <= peakvalleyamtthreshold[2] && stddev_accel < 1.5)     //What characterises a step...?
                        {
                                return true;
                        }
                }
                else
                {
                        return false;
                }
        };

        var saveSensorReading = function()    //Function to save the sensor readings, check if we need to switch video playback direction and send the sensor readings to be analyzed for whether the user is walking or not
        {
                accel = accel_sensor.accel;
                accelFiltered = new LowPassFilterData(accel, bias);
                if(validAccel(prevaccel, accel, accelFiltered))
                {
                        accelerationData.push(accelFiltered);
                        prevaccel = accel;
                        discardedsamples = discardedsamples - 3;
                }
                else    //The change in acceleration was too small (possibly noise), so the device might be stationary
                {
                        discardedsamples = discardedsamples + 2;
                }
                //When the user turns around, video direction needs to be changed
                if(needToChangeDir())
                {
                        CONTROL.changeDirection();
                }
                if(accelerationData.length >= amtStepValues)    //when we have enough data, decide whether the user is walking or not
                {
                        accelSeq = toCoordSeq(accelerationData);
                        var as = Object.assign({}, accelSeq);   //copy by value
                        stepvar = stepDetection(as);
                        CONTROL.playPause();
                        clearVars();
                }
                if(discardedsamples >= amtStepValues/8)     //Enough small acceleration changes have accumulated, so the device is most likely stationary
                {
                        stepvar = 0;
                        CONTROL.playPause();
                        clearVars();
                }
        };

	return {
                stepamt: stepamt,
                stddevthreshold: stddevthreshold,
                bias: bias,
                smoothingvalue: smoothingvalue,
                stddevpct: stddevpct,
                stddev_accel: stddev_accel,
                fft_index: fft_index,
                stepDetection: stepDetection,
                saveSensorReading: saveSensorReading
        };
}());
