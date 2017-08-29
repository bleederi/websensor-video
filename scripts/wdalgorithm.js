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

        function standardDeviation(values){
        var average = values => values.reduce( ( p, c ) => p + c, 0 ) / values.length;
          
          var squareDiffs = values.map( value => (value - average) ** 2);
          var averageSquareDiff = squareDiffs => squareDiffs.reduce( ( p, c ) => p + c, 0 ) / squareDiffs.length;
          var stdDev = Math.sqrt(averageSquareDiff);
          return stdDev;
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

        
        function smoothArray( values, smoothing ){
          var value = values[0]; //First input a special case, no smoothing
          for (let i=1, len=values.length; i<len; ++i){
            var currentValue = values[i];
            value += (currentValue - value) / smoothing;        //Substract from previous, divide by smoothing and add to the "running value"
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

        function updateTimeAverage(index, lasttime, timediff, timethreshold, data)  //Update the running time average (timethreshold) of either peak or valley data
        {
                //update time average regardless of valley accepted or not
                if(data.length >= 2)
                {
                        timediff.push(index - lasttime);
                        let diff_selected = timediff;    //select recent M valleys
                        let sum = diff_selected.reduce((previous, current) => current += previous); //sum over the array
                        timethreshold = sum/timediff.length;      //average of valley diffs
                }
                else
                {
                        if(lasttime > 0 && index > lasttime)
                        {
                                timediff.push(index - lasttime);
                        }
                        else
                        {
                                timediff.push(index);
                        }
                }
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
                                updateTimeAverage(index, lastpeaktime, peakdiff, peaktimethreshold, peaks);
                                lastpeakmag = curr;
                                lastpeaktime = index;
                                peaks.push(index);
                        }
                        else if(isValley(prev, curr, next, stepaverage, avg, variance))     //valley
                        {
                                updateTimeAverage(index, lastvalleytime, valleydiff, valleytimethreshold, valleys);
                                lastvalleymag = curr;
                                lastvalleytime = index;
                                valleys.push(index);
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

        function needToChangeDir(longitude)      //Tells if the walking direction has changed
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
                        discardedsamples = discardedsamples + 1;
                }
                //When the user turns around, video direction needs to be changed
                if(needToChangeDir(oriSensor.longitude))
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

