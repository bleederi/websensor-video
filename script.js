//Javascript function to convert from sensor readings (one for each reading), to sequences (one for each coordinate)
function toCoordSeq(buffer, key)
{
        key = 'acceleration';
        seq = buffer[key];        //Acceleration data buffer, sequence of xyz readings
/*
                #Make sequences for each key
                #First handle list keys
                if key in listkeys and key in xyzkeys and key not in numpyarrkeys:
                        seq_x = []
                        seq_y = []
                        seq_z = []
                        for i in value:
                                seq_x.append(i['x'])
                                seq_y.append(i['y'])
                                seq_z.append(i['z'])
                        seq = {'x':seq_x, 'y':seq_y, 'z':seq_z}
                elif key in listkeys and key in abgkeys and key not in numpyarrkeys:
                        seq_alpha = []
                        seq_beta = []
                        seq_gamma = []
                        for i in value:
                                seq_alpha.append(i['alpha'])
                                seq_beta.append(i['beta'])
                                seq_gamma.append(i['gamma'])
                        seq = {'alpha':seq_alpha, 'beta':seq_beta, 'gamma':seq_gamma}
                elif key in listkeys and key in numpyarrkeys:
                        seqlist = value
                #Then handle dict keys
                elif key in dictkeys and key in xyzkeys:
                        seq = {'x':value['x'], 'y':value['y'], 'z':value['z']}
                elif key in dictkeys and key in abgkeys:
                        seq = {'alpha':value['alpha'], 'beta':value['beta'], 'gamma':value['gamma']}
                else:   #DAC keys
                        data[key] = value
                if(seq):
                    data[key] = seq
                elif(seqlist):
                    data[key] = seqlist
        buttondata_array.append(data)
*/
        return seq;
}
