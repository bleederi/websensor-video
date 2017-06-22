/*
 * Websensor video project
 * https://github.com/jessenie-intel/web-sensor-js-privacy
 *
 * Copyright (c) 2017 Jesse Nieminen
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
*/

'use strict';

/* Global variables below */
var videoDiv = document.getElementById("videoview");
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
        stddevthreshold = slider_stddev.value;
        slider_stddev_div.innerHTML = stddevthreshold;
        console.log("Std dev threshold:", stddevthreshold);
};
var slider_stepamt = document.getElementById("slider_stepamt");
var slider_stepamt_div = document.getElementById("slider_stepamt_amount");
slider_stepamt.onchange = () => {
        stepamt = slider_stepamt.value;
        amtStepValues = stepamt*sensorfreq;     //recalculate
        slider_stepamt_div.innerHTML = stepamt;
        console.log("Step amount:", stepamt);
};
var slider_bias = document.getElementById("slider_bias");
var slider_bias_div = document.getElementById("slider_bias_amount");
slider_bias.onchange = () => {
        bias = slider_bias.value;
        slider_bias_div.innerHTML = bias;
        console.log("Filter bias:", bias);
};

var smoothing_value = document.getElementById("smoothing_value");
var smoothing_value_div = document.getElementById("smoothing_amount");
smoothing_value.onchange = () => {
        smoothingvalue = smoothing_value.value;
        smoothing_value_div.innerHTML = smoothingvalue;
        console.log("Smoothing value:", smoothingvalue);
}
var rewinding = false;
var rw; //variable for controlling the rewind loop
var reading;    //variable for controlling the data reading loop
var ut; //debug text update var
var accelerationData = [];        //sequence to store xyz accelerometer readings
var accelSeq = {x:null, y:null, z:null};      //dict to store accelerometer reading sequences
var accel = {x:null, y:null, z:null};
var accelFiltered = {x:null, y:null, z:null};
var gravity;
var accelNoG;
var orientationMat = new Float64Array([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]);     //device orientation
var orientationMatInitial = new Float64Array([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]);          //variable for storing initial orientation matrix
var prevaccel = {x:null, y:null, z:null};
var diff = {x:null, y:null, z:null};
var sensorfreq = 60;
var stepvar = null;     //0 when not walking, 1 when walking
var accel_sensor = null;
var orientation_sensor = null;
var initialoriobtained = false;
var roll = 0;
var pitch = 0;
var yaw = 0;
var longitudeInitial = null;
var latitude;
var longitude;
var longitudeOffset;

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

//Rendering vars (Three.JS)
var camera = null;
var videocanvasctx = null;
var renderer = null;
var scene = null;
var sphere = null;
var video = null;
var videoF = null;
var videoB = null;
var videoTexture = null;
var sphereMaterial = null;
var sphereMesh = null;

//for systems with no sensors
var nosensors = false;
//For timekeeping used in switching video
var time = null;

//Sensor classes and low-pass filter
class Pedometer {
        constructor() {
        const sensor = new Accelerometer({ frequency: sensorfreq });
        //gravity =  new LowPassFilterData(sensor, 0.8);        //Maybe should calculate gravity this way?
        sensor.onchange = () => {
                accel = {'x':sensor.x, 'y':sensor.y, 'z':sensor.z};
                if (this.onchange) this.onchange();
        };
        sensor.onactivate = () => {
                if (this.onactivate) this.onactivate();
        }
        const start = () => sensor.start();
        Object.assign(this, { start });
        }
}
class AbsOriSensor {
        constructor() {
        const sensor = new AbsoluteOrientationSensor({ frequency: sensorfreq });
        const mat4 = new Float32Array(16);
        const euler = new Float32Array(3);
        sensor.onchange = () => {
                sensor.populateMatrix(mat4);
                toEulerianAngle(sensor.quaternion, euler);      //From quaternion to Eulerian angles
                this.roll = euler[0];
                this.pitch = euler[1];
                this.yaw = euler[2];
                if (this.onchange) this.onchange();
        };
        sensor.onactivate = () => {
                if (this.onactivate) this.onactivate();
        }
        const start = () => sensor.start();
        Object.assign(this, { start });
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
};

//Functions to handle data

//WINDOWS 10 HAS DIFFERENT CONVENTION: Yaw z, pitch x, roll y
function toEulerianAngle(quat, out)
{
        const ysqr = quat[1] ** 2;

        // Roll (x-axis rotation).
        const t0 = 2 * (quat[3] * quat[0] + quat[1] * quat[2]);
        const t1 = 1 - 2 * (ysqr + quat[0] ** 2);
        out[0] = Math.atan2(t0, t1);
        // Pitch (y-axis rotation).
        let t2 = 2 * (quat[3] * quat[1] - quat[2] * quat[0]);
        t2 = t2 > 1 ? 1 : t2;
        t2 = t2 < -1 ? -1 : t2;
        out[1] = Math.asin(t2);
        // Yaw (z-axis rotation).
        const t3 = 2 * (quat[3] * quat[2] + quat[0] * quat[1]);
        const t4 = 1 - 2 * (ysqr + quat[2] ** 2);
        out[2] = Math.atan2(t3, t4);
        return out;
}
//Javascript function to convert from sensor readings (one for each reading), to sequences (one for each coordinate)
function toCoordSeq(buffer)
{
        let seq_x = [];
        let seq_y = [];
        let seq_z = [];
        for (var i in buffer)
        {
                seq_x.push(buffer[i].x);        
                seq_y.push(buffer[i].y);
                seq_z.push(buffer[i].z);
        }
        var seq = {'x':seq_x, 'y':seq_y, 'z':seq_z};
        return seq;
}

/**
 * Slices the object. Note that returns a new spliced object,
 * e.g. do not modifies original object. Also note that that sliced elements
 * are sorted alphabetically by object property name.
 * Credit to https://stackoverflow.com/a/20682709
 */
function slice(obj, start, end) {
    var sliced = {};
    for (var k in obj) {
        sliced[k] = obj[k].slice(start, end);
    }

    return sliced;
}

function removeDuplicates(arr) {
    let s = new Set(arr);
    let v = s.values();
    return Array.from(v);
}

function magnitude(vector)      //Calculate the magnitude of a vector
{
return Math.sqrt(vector.x * vector.x + vector.y * vector.y + vector.z * vector.z);
}

function magnitude2(seq)      //Calculate the magnitude sequence for 3 acceleration sequences
{
        let magseq = [];
        for (var k in seq)
        {
                for (var i in seq[k])
                {
                        magseq[i] = Math.sqrt(seq.x[i] * seq.x[i] + seq.y[i] * seq.y[i] + seq.z[i] * seq.z[i]);
                }
        }
        return magseq;
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
  
    for(var i=0; i<shortestArrayLength; i++) {
        xy.push(x[i] * y[i]);
        x2.push(x[i] * x[i]);
        y2.push(y[i] * y[i]);
    }
  
    var sum_x = 0;
    var sum_y = 0;
    var sum_xy = 0;
    var sum_x2 = 0;
    var sum_y2 = 0;
  
    for(var i=0; i< shortestArrayLength; i++) {
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

//Functions for the WD algorithm and that the algorithm uses

function detectPeaksValleys(seq)
{
        let result = {"peaks":null, "valleys":null};
        let peakdiff = [];
        let valleydiff = [];
        let peaks = [];
        let valleys = [];
        let variance = 0.5 + standardDeviation(seq)/alpha;
        let avg = seq.reduce(function(sum, a) { return sum + a },0)/(seq.length||1);
        for (var i in seq)
        {
                let index = parseInt(i);
                let prev = seq[index-1];
                let curr = seq[index];
                let next = seq[index+1];
                let lastpeakmag = null;
                let lastvalleymag = null;
                let lastpeaktime = null;
                let lastvalleytime = null;

                if(curr > prev && curr > next && (curr > stepaverage || !stepaverage) && curr > (avg+variance))  //peak
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
                else if(curr < prev && curr < next && (curr < stepaverage || !stepaverage) && curr < (avg-variance))     //valley
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

//http://phrogz.net/js/framerate-independent-low-pass-filter.html
// values:    an array of numbers that will be modified in place
// smoothing: the strength of the smoothing filter; 1=no change, larger values smoothes more
function smoothArray( values, smoothing ){
  var value = values[0]; // start with the first input
  for (var i=1, len=values.length; i<len; ++i){
    var currentValue = values[i];
    value += (currentValue - value) / smoothing;
    values[i] = value;
  }
}

function stepDetection(seq)      //Returns 1 if there was a step in the given sequence, otherwise 0
{
        let magseq = magnitude2(seq);
        //Smoothen (filter noise)
        smoothArray(magseq, smoothingvalue);        //smooths "in-place" - 8 seems to be a good value
        let peaksvalleys = null;
        let peakdiff = [];
        let valleydiff = [];
        for (var i = 0; i < magseq.length+1; i++)       //analyze sequence sample by sample
        {
                peaksvalleys = detectPeaksValleys(magseq.slice(0, i));
        }
        let peaks = peaksvalleys.peaks;
        let valleys = peaksvalleys.valleys;
        //Now remove peak and valley candidates outside a pre-defined time range after each peak occurrence
        //remove peaks that don't meet condition
        for (var i in peakdiff)
        {
                if(peakdiff[i] < peaktimethreshold)
                {
                        peaks[i] = null;
                }
        }
        //remove valleys that don't meet condition
        for (var i in valleydiff)
        {
                if(valleydiff[i] < valleytimethreshhold)
                {
                        valleys[i] = null;
                }
        }
        //filter the non-valid peaks and valleys out
        peaks = peaks.filter(function(n){ return n !== undefined });
        valleys = valleys.filter(function(n){ return n !== undefined });
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
        let min = Math.min( ...stepdiff );
        let stddev = standardDeviation(stepdiff);
        var magseqnog = magseq.map( function(value) {        //substract gravity (approx.9.81m/s2)
            return value - 9.81;
        } );
        stddev_accel = standardDeviation(magseqnog);
        average_accel_nog = magseqnog.reduce(function(sum, a) { return sum + a },0)/(magseqnog.length||1);
        stddevpct = stddev / min;

        let real = magseqnog.slice();
        let imag = Array.apply(null, Array(magseqnog.length)).map(Number.prototype.valueOf,0);     //create imag array for fft computation
        transform(real, imag);  //not normalized, from FFT.js
        real = real.map(x => x/real.length);      //normalize
        imag = imag.map(x => x/imag.length);      //normalize
        let fft = [];
        for(var i=0; i< real.length; i++) {
        fft[i] = Math.sqrt(real[i]*real[i]+imag[i]*imag[i]);    //magnitude of FFT
        }
        fft = fft.map(x => x/fft.reduce((a, b) => a + b, 0));
        fft_index = fft.indexOf(Math.max(...fft));      //tells where the largest value in the FFT is
        if(fft_index > 4)    //definitely walking
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


//TODO: Split this function into parts
function saveSensorReading()    //Function to save the sensor readings, check if we need to rewind and send the sensor readings to be analyzed for whether the user is walking or not
{
        accel = {x:accel.x, y:accel.y, z:accel.z};
        accelFiltered = new LowPassFilterData(accel, bias);
        if(magnitude(prevaccel) != magnitude(accel) && Math.abs(magnitude(accelFiltered) - magnitude(prevaccel)) > accdiffthreshold)
        {
                accelerationData.push(accelFiltered);
                prevaccel = accel;
                discardedsamples = discardedsamples - 3;
        }
        else
        {
                discardedsamples = discardedsamples + 1;
        }
        if((Math.abs(longitude - 180) < 20 && rewinding == false) || ((longitude < 10 || longitude > 350 ) && rewinding == true))
        {
                rewind();
        }
        if(accelerationData.length >= amtStepValues)    //when we have enough data, decide whether the user is walking or not
        {
                accelSeq = toCoordSeq(accelerationData);
                var as = Object.assign({}, accelSeq);
                stepvar = stepDetection(as);
                playPause();
                clearVars();
        }
        if(discardedsamples >= amtStepValues/5)     //device most likely stationary
        {
                stepvar = 0;
                playPause();
                clearVars();
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
        stddev_div.innerHTML = stddevpct;
        stddev_accel_div.innerHTML = stddev_accel;
        fftindex_div.innerHTML = fft_index;
}
