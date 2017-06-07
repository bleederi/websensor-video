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
