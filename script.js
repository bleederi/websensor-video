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
                index = parseInt(i);
                let prev = seq[index-1];
                let curr = seq[index];
                let next = seq[index+1];

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
        let max = Math.max( ...stepdiff );
        let min = Math.min( ...stepdiff );
        let stddev = standardDeviation(stepdiff);
        var magseqnog = magseq.map( function(value) {        //substract gravity (approx.9.81m/s2)
            return value - 9.81;
        } );
        stddev_accel = standardDeviation(magseqnog);
        average_accel_nog = magseqnog.reduce(function(sum, a) { return sum + a },0)/(magseqnog.length||1);
        let min_accel = Math.min(...magseqnog);
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

function updateSlider(slideAmount)
{
alert("error");
var sliderDiv = document.getElementById("sliderAmount");
sliderDiv.innerHTML = slideAmount;
}

                function updateText()   //For updating debug text
                {
                        if(stepvar)
                        {
                                walking_status_div = document.getElementById("walking_status");
                                walking_status_div.innerHTML = "Walking";
                        }
                        else if (!stepvar)
                        {
                                walking_status_div = document.getElementById("walking_status");
                                walking_status_div.innerHTML = "Not walking";
                        }
                        rw_div.innerHTML = rewinding;
                }
