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
        seq_x = [];
        seq_y = [];
        seq_z = [];
        for (var i in buffer)
        {
                seq_x.push(buffer[i]['x']);
                seq_y.push(buffer[i]['y']);
                seq_z.push(buffer[i]['z']);
        }
        seq = {'x':seq_x, 'y':seq_y, 'z':seq_z};
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

function stepDetection(seq)      //Returns 1 if there was a step in the given sequence, otherwise 0
{
        //console.log(seq);
        //first filter the sequence using a MA-3 filter
        let maseq = {'x':null, 'y':null, 'z':null};
        for (var k in seq)
        {
                maseq[k] = [];
                for (var i in seq[k])
                {
                        if(i == 1 || i == seq[k].length)
                        {
                                maseq[k][i] = null;
                        }
                        else
                        {
                                maseq[k][i] = (seq[k][i] + seq[k][i] + seq[k][i-1])/3.0;
                        }
                }
        }
        console.log(maseq);
        //now find peaks using derivative sequence
        //create derivative sequence
        let derseq = {'x':null, 'y':null, 'z':null};
        for (var k in maseq)
        {
                derseq[k] = [];
                //console.log(seq[k]);
                for (var i in maseq[k])
                {
                        if(i == 0)
                        {
                                derseq[k][i] = null;
                        }
                        else
                        {
                                derseq[k][i] = maseq[k][i] - maseq[k][i-1];
                        }
                }
        }
        //now find the peaks using it
        for (var k in derseq)
        {
                for (var i in derseq[k])
                {
                        if(i >= 1)
                        {
                                //if((derseq[k][i] < 0 && derseq[k][i-1] >= 0) || (derseq[k][i] <= 0 && derseq[k][i-1] == 0))
                                if(derseq[k][i] < 0 && derseq[k][i-1] >= 0 && seq[k][i] > 3)
                                {
                                        console.log("Max peak at", i);                                
                                }
                        }
                }
        } 
        let maxval = {'x':Math.max.apply(null, (seq['x'])), 'y':Math.max.apply(null, (seq['y'])), 'z':Math.max.apply(null, (seq['z']))};
        let minval = {'x':Math.min.apply(null, (seq['x'])), 'y':Math.min.apply(null, (seq['y'])), 'z':Math.min.apply(null, (seq['z']))};
        let diff = {'x': maxval['x'] - minval['x'], 'y': maxval['y'] - minval['y'], 'z': maxval['z'] - minval['z']};
        if(diff['y'] > 3 && diff['x'] > 0.4)
        {
                return 1;
        }
        return 0;
}
