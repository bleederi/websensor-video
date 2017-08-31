// This algorithm is adapted to and tested on a Nexus smartphone

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

// The walking detection algorithm
// Device dependent, tested on a Pixel smartphone
var ALGORITHM = (function () {
	var algo = {};

    // For storing acceleration data
    var accelerationData = [];
    var accelSeq = {x:null, y:null, z:null};
    var accelFiltered = {x:null, y:null, z:null};
    var prevaccel = {x:null, y:null, z:null};
    var diff = {x:null, y:null, z:null};

    // Thresholds and other constant values for the algorithm

    const stepamt = 2;

    // Buffer size for step analysis
    // Should be about how long 2 steps will take (here stepamt seconds)
    var amtStepValues = stepamt*sensorFreq;

    // If acceleration changes less than this, ignore it(for removing noise)
    const accdiffthreshold = 0.15;

    // 0.4 good for walking in place, 2.9 with tablet, 0.3 for Pixel
    // A lower value means more sensitive to walking and also more false positives
    const stddevthreshold = 2.8;

    // In below arrays, first values for Windows tablet, second values for Nexus tablet
    // 12 for Pixel.. need to filter better
    const peakvalleyamtthreshold = [2, 6, 12];
    const bias = 1; //bias for low-pass filtering the data, 1 seems to work good with the tablet
    const smoothingvalue = 8; //for smoothing out noise (extra peaks and valleys) - 8 seems to work well (6 also)
    const alpha = 4;

    // These values will be set by the algorithm
    var stepaverage, peaktimethreshold, valleytimethreshold, discardedsamples, average_accel_nog,
        stddevpct, stddev_accel, fft_index;

    // Below are functions for the WD algorithm and functions used in the algorithm

    // Functions to process data

    // Function to convert from sensor readings (one for each reading), to sequences (one for each coordinate)
    function toCoordSeq(buffer)
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

    function standardDeviation(values) {
        var average = values => values.reduce( ( p, c ) => p + c, 0 ) / values.length;    
        var squareDiffs = values.map( value => (value - average) ** 2);
        var averageSquareDiff = squareDiffs => squareDiffs.reduce( ( p, c ) => p + c, 0 ) / squareDiffs.length;
        var stdDev = Math.sqrt(averageSquareDiff);
        return stdDev;
    }

    function pcorr(x, y) {
        let shortestArrayLength = 0;
         
        if(x.length == y.length) {
            shortestArrayLength = x.length;
        // Will ignore the extra elements of the arrays
        } else if(x.length > y.length) {
            shortestArrayLength = y.length;
        } else {
            shortestArrayLength = x.length;
        }

        let xy = [];
        let x2 = [];
        let y2 = [];

        for(let i=0; i<shortestArrayLength; i++) {
            xy.push(x[i] * y[i]);
            x2.push(x[i] * x[i]);
            y2.push(y[i] * y[i]);
        }

        let sum_x = 0;
        let sum_y = 0;
        let sum_xy = 0;
        let sum_x2 = 0;
        let sum_y2 = 0;

        for(let i=0; i< shortestArrayLength; i++) {
            sum_x += x[i];
            sum_y += y[i];
            sum_xy += xy[i];
            sum_x2 += x2[i];
            sum_y2 += y2[i];
        }

        let v1 = (shortestArrayLength * sum_xy) - (sum_x * sum_y);
        let v2 = (shortestArrayLength * sum_x2) - (sum_x * sum_x);
        let v3 = (shortestArrayLength * sum_y2) - (sum_y * sum_y);
        let v4 = Math.sqrt(v2 * v3);
        let corrcoeff = v1 / v4;

        return corrcoeff;
    }
   
    function smoothArray( values, smoothing ){
        var value = values[0]; // First input a special case, no smoothing
        for (let i=1, len=values.length; i<len; ++i) {
            let currentValue = values[i];

            // Substract from previous, divide by smoothing and add to the "running value"
            value += (currentValue - value) / smoothing;
            values[i] = value;
        }
    }

    function clearVars() {  // Clear vars every loop iteration
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

    // Update the running time average (timethreshold) of either peak or valley data
    function updateTimeAverage(index, lasttime, timediff, timethreshold, data)
    {

            // Update time average regardless of valley accepted or not
            if(data.length >= 2)
            {
                    timediff.push(index - lasttime);
                    let diff_selected = timediff;    // Select recent M valleys
                    let sum = diff_selected.reduce((previous, current) => current += previous);
                    timethreshold = sum/diff_selected.length;      // Average of valley diffs
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
            let peakdiff = [], valleydiff = [], peaks = [], valleys = [];
            let variance = 0.5 + standardDeviation(seq)/alpha;
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

    function validAccel(prevaccel, accel, accelFiltered)    // Determines if the acceleration value that was read was a valid one (device movement) instead of noise
    {
            return magnitude(prevaccel) != magnitude(accel) && Math.abs(magnitude(accelFiltered) - magnitude(prevaccel)) > accdiffthreshold;        
    }

    function needToChangeDir(longitude)      // Tells if the walking direction has changed TODO: Make work with negative longitude also (remove the longitude conversion to positive)
    {
        if(longitude < 0)       // When the user is turned backwards, we still want to always keep the longitude above 0, maybe could also rotate the video sphere?
        {
            longitude = longitude + 2*Math.PI;
        }
        return (Math.abs(longitude - Math.PI) < (20 / 180) * Math.PI && rewinding == false) || ((longitude < (10 / 180) * Math.PI || longitude > (350 / 180) * Math.PI ) && rewinding == true);
    }

    // The "public interfaces" are the stepDetection and saveSensorReading functions
    // Algorithm modified version of the algorithm from paper http://www.mdpi.com/1424-8220/15/10/27230
    var stepDetection = function (seq)      // Returns 1 if there was a step in the given acceleration sequence, otherwise 0
    {
            let magseq = magnitude(seq, "seq");     // Calculate the combined magnitude sequence from the 3 distinct xyz sequences
            // Smoothen (filter noise)
            smoothArray(magseq, smoothingvalue);        // Smoothens "in-place" - 8 seems to be a good value

            let peaksvalleys = null;
            let peakdiff = [];
            let valleydiff = [];
            // Analyze sequence sample by sample - mimics real-time behavior
            for (var i = 0; i < magseq.length+1; i++) {
                    peaksvalleys = detectPeaksValleys(magseq.slice(0, i));
            }
            let peaks = peaksvalleys.peaks;
            let valleys = peaksvalleys.valleys;
            // Now remove peak and valley candidates outside a pre-defined time range after each peak occurrence
            // Filter the non-valid peaks and valleys out
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
            var magseqnog = magseq.map( function(value) {        // Substract gravity (approx.9.81m/s^2) - probably could use filtering instead to do this
                return value - GRAVITY;
            });
            stddev_accel = standardDeviation(magseqnog);
            average_accel_nog = magseqnog.reduce(function(sum, a) { return sum + a; },0)/(magseqnog.length||1);     //Calculate average acceleration
            stddevpct = stddev / minDiff;

            let fft = calculateFFT(magseqnog);
            fft_index = fft.indexOf(Math.max(...fft));      //tells where the largest value in the FFT is
            if(highFreq(fft))    //definitely walking - low-frequency changes in movement most likely mean the user is moving the device to look around and not walking
            {
                    return true;
            }
            if(stepdiff.length >= Math.floor(stepamt)) {
                    if(stddevpct < stddevthreshold && !isNaN(stddevpct) && Math.abs(peaks.length - valleys.length) <= peakvalleyamtthreshold[2] && stddev_accel < 1.5)     // What characterises a step...?
                    {
                            return true;
                    }
            }
            else {
                    return false;
            }
    };

    var saveSensorReading = function()    // Function to save the sensor readings, check if we need to switch video playback direction and send the sensor readings to be analyzed for whether the user is walking or not
    {
            //accel = accel_sensor.accel;
            accel = {"x": accel_sensor.x, "y": accel_sensor.y, "z": accel_sensor.z};
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
            if(needToChangeDir(orientation_sensor.longitude))
            {
                    CONTROL.changeDirection();
            }
            if(accelerationData.length >= amtStepValues)    // When we have enough data, decide whether the user is walking or not
            {
                    accelSeq = toCoordSeq(accelerationData);
                    var as = Object.assign({}, accelSeq);   // Copy by value
                    stepvar = stepDetection(as);
                    CONTROL.playPause();
                    clearVars();
            }
            if(discardedsamples >= amtStepValues/8)     // If enough small acceleration changes have accumulated, the device is most likely stationary
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

