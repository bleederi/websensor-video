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
    var i = 0;
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
        let maxval = {'x':Math.max.apply(null, (seq['x'])), 'y':Math.max.apply(null, (seq['y'])), 'z':Math.max.apply(null, (seq['z']))};
        let minval = {'x':Math.min.apply(null, (seq['x'])), 'y':Math.min.apply(null, (seq['y'])), 'z':Math.min.apply(null, (seq['z']))};
        diff = {'x': maxval['x'] - minval['x'], 'y': maxval['y'] - minval['y'], 'z': maxval['z'] - minval['z']};
        console.log(diff);
        if(diff['y'] > 3)
        {
                console.log("STEP");
                return 1;
        }
        return 0;
}
