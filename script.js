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

//Javascript function to convert from sensor readings (one for each reading), to sequences (one for each coordinate)
function toCoordSeq(buffer)
{
        let seq_x = [];
        let seq_y = [];
        let seq_z = [];
        for (var i in buffer)
        {
                seq_x.push(buffer[i]['x']);        
                seq_y.push(buffer[i]['y']);
                seq_z.push(buffer[i]['z']);
        }
        let seq = {'x':seq_x, 'y':seq_y, 'z':seq_z};
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

function magnitude(vector)      //Calculate the magnitude of a vector
{
return Math.sqrt(vector.x * vector.x + vector.y * vector.y + vector.z * vector.z);
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

function stepDetection(seq)      //Returns 1 if there was a step in the given sequence, otherwise 0
{
        //console.log(seq);
        //first filter the sequence using a MA-3 filter
        var maseq = {'x':null, 'y':null, 'z':null};
        for (var k in seq)
        {
                maseq[k] = [];
                for (var i in seq[k])
                {
                        if((i <= 0) || (i == seq[k].length))
                        {
                                maseq[k][i] = null;
                        }
                        else
                        {
                                maseq[k][i] = (seq[k][i-1] + seq[k][i] + seq[k][i+1])/3.0;
                        }
                }
        }
        console.log(maseq);
        //now find peaks using derivative sequence
        //create derivative sequence
        derseq = {'x':null, 'y':null, 'z':null};
        for (var k in maseq)
        {
                derseq[k] = [];
                for (var i in maseq[k])
                {
                        if(i <= 1)
                        {
                                derseq[k][i] = null;
                        }
                        else
                        {
                                derseq[k][i] = maseq[k][i] - maseq[k][i-1];
                                //console.log(k, derseq[k][i]);
                        }
                }
        }
        //console.log(derseq);
        //now find the peaks using it
        for (var k in seq)
        {
                for (var i in seq[k])
                {
                        if(i >= 1 && i != seq[k].length)
                        {
                                //console.log(i);
                                //if((derseq[k][i] < 0 && derseq[k][i-1] >= 0) || (derseq[k][i] <= 0 && derseq[k][i-1] == 0))
                                if((seq[k][i] > seq[k][i-1]) && (seq[k][i] > seq[k][i+1]) && (Math.abs(seq[k][i]) > 9))
                                {
                                        //console.log("Max", k, "at", i, seq[k][i]);                                
                                }
                        }
                }
        }
        let maxval = {'x':Math.max.apply(null, (seq['x'])), 'y':Math.max.apply(null, (seq['y'])), 'z':Math.max.apply(null, (seq['z']))};
        let minval = {'x':Math.min.apply(null, (seq['x'])), 'y':Math.min.apply(null, (seq['y'])), 'z':Math.min.apply(null, (seq['z']))};
        let diff = {'x': maxval['x'] - minval['x'], 'y': maxval['y'] - minval['y'], 'z': maxval['z'] - minval['z']};
        if(diff['y'] > 3 && diff['x'] > 0.4)
        {
                //return 1;
        }
        return 0;
}
