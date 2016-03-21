'use strict';

var fs = require('fs');

var save = (game, location, filename, cb) => {

    // Validate that all the necessary parameters are present
    let error = '';
    if (!game.regionId)             error = 'Error: regionId missing';
    if (!game.gameId)               error = 'Error: gameId missing';
    if (!game.riotVersion)          error = 'Error: riotVersion missing';
    if (!game.key)                  error = 'Error: encryption key missing';
    if (!game.endStartupChunkId)    error = 'Error: endStartupChunkId missing';
    if (!game.startGameChunkId)     error = 'Error: startGameChunkId missing';
    if (error) {
        cb(error);
        return;
    }

    // Check players array, should contain at least 1 player
    if (game.players && game.players.length === 0)  console.log('Warning: No players!');
    if (!game.players) game.players = [];

    // Check keyframes
    if (game.keyframes && game.keyframes.length === 0)  console.log('Warning: No keyframes!');
    if (!game.keyframes) game.keyframes = [];

    // Check chunks
    if (game.chunks && game.chunks.length === 0)  console.log('Warning: No chunks!');
    if (!game.chunks) game.chunks = [];

    // Start counting keyframes/chunks
    let dataLength = 0; // Used to calculate the length of the buffer

    let totalKeyframes = 0; // Count total keyframes
    let totalChunks = 0; // Count total chunks

    game.keyframes.forEach((data) => {
        dataLength += data.data.length;
        totalKeyframes++;
    });

    game.chunks.forEach((data) => {
        dataLength += data.data.length;
        totalChunks++;
    });

    // Compare count with array length to check if we have all keyframes / chunks
    let complete = (totalKeyframes === game.keyframes.length - 1) && (totalChunks === game.chunks.length - 1) ? 1 : 0;

    // Create a replay file
    let c = 0;
    let keyLen = Buffer.byteLength(game.key, 'base64');
    let buff = new Buffer(18 + keyLen);
    //buff.fill(0);
    //console.log(buff);

    // Splits gameId into low and high 32bit numbers
    let high = Math.floor(game.gameId / 4294967296);        // right shift by 32 bits (js doesn't support '>> 32')
    let low = game.gameId - high * 4294967296;              // extract lower 32 bits

    // File version
    buff.writeUInt8(12, c);                                 c += 1;
    //console.log(buff);

    // Extract bytes for riot version
    let splits = game.riotVersion.split('.');

    //logger.log('debug', 'Writing basic game info for %s', game.key);

    // Basic game info
    buff.writeUInt8(game.regionId, c);                      c += 1;
    buff.writeUInt32BE(high, c);                            c += 4;
    buff.writeUInt32BE(low, c);                             c += 4;
    buff.writeUInt8(splits[0], c);                          c += 1;
    buff.writeUInt8(splits[1], c);                          c += 1;
    buff.writeUInt8(splits[2], c);                          c += 1;
    buff.writeUInt8(keyLen, c);                             c += 1;
    buff.write(game.key, c, keyLen, 'base64');              c += keyLen;
    buff.writeUInt8(complete ? 1 : 0, c);                   c += 1;
    buff.writeUInt8(game.endStartupChunkId, c);             c += 1;
    buff.writeUInt8(game.startGameChunkId, c);              c += 1;

    // Players
    buff.writeUInt8(game.players.length, c);                c += 1;

    for (let i = 0; i < game.players.length; i++) {
        let p = game.players[i];
        let len = Buffer.byteLength(p.summonerName, 'utf8');
        let tempBuff = new Buffer(20 + len);
        let d = 0;

        tempBuff.writeInt32BE(p.id, d);                       d += 4;
        tempBuff.writeUInt8(len, d);                          d += 1;
        tempBuff.write(p.summonerName, d, len, 'utf8');       d += len;
        tempBuff.writeUInt8(p.teamNr, d);                     d += 1;
        tempBuff.writeUInt8(p.leagueId, d);	                  d += 1;
        tempBuff.writeUInt8(p.leagueRank, d);                 d += 1;
        tempBuff.writeInt32BE(p.championId, d);               d += 4;
        tempBuff.writeInt32BE(p.dId, d);                      d += 4;
        tempBuff.writeInt32BE(p.fId, d);                      d += 4;

        buff = Buffer.concat([ buff, tempBuff ]);             c += tempBuff.length;
    }

    // Extend buffer
    buff = Buffer.concat([ buff, new Buffer(4 + dataLength + (totalKeyframes + totalChunks) * 6) ]);

    // Keyframes
    buff.writeUInt16BE(totalKeyframes, c);                  c += 2;
    game.keyframes.forEach(function(keyframe, index) {
        if (!keyframe)
            return;

        buff.writeUInt16BE(keyframe.id, c);                   c += 2;
        buff.writeInt32BE(keyframe.data.length, c);           c += 4;

        keyframe.data.copy(buff, c);

        c += keyframe.data.length;
    });

    //logger.log('debug', 'Writing chunks for %s', game.key);

    // Chunks
    buff.writeUInt16BE(totalChunks, c);                     c += 2;
    game.chunks.forEach(function(chunk, index) {
        if (!chunk)
            return;

        buff.writeUInt16BE(chunk.id, c);                      c += 2;
        buff.writeInt32BE(chunk.data.length, c);              c += 4; // length of chunk

        chunk.data.copy(buff, c);

        c += chunk.data.length;
    });

    let file = location + filename + '.aof';
    fs.writeFile(file, buff, (err) => {
        if(err) {
            cb(err);
        }
        cb(false);
    });
};

let load = (file, cb) => {

    let replayMetadata = {};
    let replayData = {};

    let buff = fs.readFileSync(file);
    let c = 0;

    // Read file version
    replayMetadata.version = buff.readUInt8(c);                 c += 1;
    if (replayMetadata.version < 8) {
        //logger.warn('The file is using an old data format');
    } else if (replayMetadata.version == 9) {
        //logger.error('This file is using a corrupted data format. Please report this to an administrator of aof.gg');
    }

    // Read the region id
    replayMetadata.regionId = buff.readUInt8(c);                c += 1;

    // Read the game id
    if (replayMetadata.version == 8) {
        replayMetadata.gameId = buff.readUInt32BE(c);           c += 4;
    } else {
        let high = buff.readUInt32BE(c);                        c += 4;
        let low = buff.readUInt32BE(c);                         c += 4;
        replayMetadata.gameId = high * 4294967296 + low;
    }

    // Read the riot version
    replayMetadata.riotVersion = buff.readUInt8(c);             c += 1;
    replayMetadata.riotVersion += '.' + buff.readUInt8(c);      c += 1;
    replayMetadata.riotVersion += '.' + buff.readUInt8(c);      c += 1;

    // Read additional data for the replay
    let len = buff.readUInt8(c);                                c += 1;
    replayMetadata.key = buff.toString('base64', c, c + len);   c += len;
    replayMetadata.complete = buff.readUInt8(c);                c += 1;
    replayMetadata.endStartupChunkId = buff.readUInt8(c);       c += 1;
    replayMetadata.startGameChunkId = buff.readUInt8(c);        c += 1;

    // Read the player data
    replayMetadata.players = [];
    let num = buff.readUInt8(c);                                c += 1;
    for (let i = 0; i < num; i++) {
        let p = {};

        p.id = buff.readInt32BE(c);                             c += 4;
        len = buff.readUInt8(c);                                c += 1;
        p.summonerName = buff.toString('utf8', c, c + len);     c += len;

        p.teamNr = buff.readUInt8(c);                           c += 1;
        p.leagueId = buff.readUInt8(c);                         c += 1;
        p.leagueRank = buff.readUInt8(c);                       c += 1;
        p.championId = buff.readInt32BE(c);                     c += 4;
        p.dId = buff.readInt32BE(c);                            c += 4;
        p.fId = buff.readInt32BE(c);                            c += 4;

        replayMetadata.players.push(p);
    }

    // Read the keyframes
    replayData.keyframes = [];
    if (replayMetadata.version < 11) {
        num = buff.readUInt8(c);                                c += 1;
    } else {
        num = buff.readUInt16BE(c);                             c += 2;
    }
    for (let i = 0; i < num; i++) {
        let keyframe = {};
        if (replayMetadata.version < 11) {
            keyframe.id = buff.readUInt8(c);                    c += 1;
        } else if (replayMetadata.version == 11) {
            keyframe.id = i + 1;                                c += 1;
        } else {
            keyframe.id = buff.readUInt16BE(c);                 c += 2;
        }
        len = buff.readInt32BE(c);                              c += 4;
        keyframe.data = new Buffer(len);
        buff.copy(keyframe.data, 0, c, c + len);                c += len;

        replayData.keyframes[keyframe.id] = keyframe;
    }

    // Read the chunks
    replayData.chunks = [];
    if (replayMetadata.version < 11) {
        num = buff.readUInt8(c);                                c += 1;
    } else {
        num = buff.readUInt16BE(c);                             c += 2;
    }
    for (let i = 0; i < num; i++) {
        let chunk = {};
        if (replayMetadata.version < 11) {
            chunk.id = buff.readUInt8(c);                       c += 1;
        } else if (replayMetadata.version == 11) {
            chunk.id = i + 1;                                   c += 1;
        } else {
            chunk.id = buff.readUInt16BE(c);                    c += 2;
        }
        len = buff.readInt32BE(c);                              c += 4;
        chunk.data = new Buffer(len);
        buff.copy(chunk.data, 0, c, c + len);                   c += len;

        replayData.chunks[chunk.id] = chunk;
    }

    // Calculate the last chunk id
    if (replayData.chunks.length > 0) {
        replayMetadata.endGameChunkId = replayData.chunks[replayData.chunks.length - 1].id
    } else {
        // ERROR: NO CHUNKS
    }

    //logger.info('Opened replay file %s containing %s-%s @ %s', file, replayMetadata.regionId, replayMetadata.gameId, replayMetadata.riotVersion);

    cb(false, replayMetadata, replayData);

};

module.exports = {
    save: save,
    load: load
};