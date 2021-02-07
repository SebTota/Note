var fs			    = require('fs');
var got             = require('got');
var EventEmitter	= require('events').EventEmitter;
var mime		    = require('mime');
var util		    = require('util');
var stream          = require('stream');
var {promisify}     = require('util');

function resumableUpload() {
    this.byteCount	= 0; //init variables
    this.tokens	    = {};
    this.filepath	= '';
    this.metadata	= {};
    this.retry	    = -1;
    this.host	    = 'www.googleapis.com';
    this.api	    = '/upload/youtube/v3/videos';
}

util.inherits(resumableUpload, EventEmitter);

//Init the upload by POSTing google for an upload URL (saved to self.location)
resumableUpload.prototype.upload = async function() {
    var self = this;
    var options = {
        url:	'https://' + self.host + self.api + '?uploadType=resumable&part=snippet,status,contentDetails',
        headers: {
            'Host':			self.host,
            'Authorization'             :  'Bearer ' + self.tokens.access_token,
            'Content-Length'            :   new Buffer.from(JSON.stringify(self.metadata)).length,
            'Content-Type'              :   'application/json; charset=UTF-8',
            'X-Upload-Content-Length'   :   fs.statSync(self.filepath).size
        },
        body: JSON.stringify(self.metadata)
    };

    //Send request and start upload if success
    let res;
    let err;

    try {
        res = await got.post(options);
    } catch(e) {
        err = e;
    }

    if (err || !res.headers.location) {
        /*
        if (err.response.statusCode === 401) {
            // Expired authorization token
            // Refresh token
        }
         */

        self.emit('error', new Error(err));
        self.emit('progress', 'Retrying ...');
        if ((self.retry > 0) || (self.retry <= -1)) {
            self.retry--;
            await self.upload(); // retry
        }
    }

    if (res) {
        self.location = res.headers.location;
        await self.send();
    }
}

//Pipes uploadPipe to self.location (Google's Location header)
resumableUpload.prototype.send = function() {
    var self = this;
    var options = {
        url: self.location
    };
    try {
        //creates file stream, pipes it to self.location
        this.uploadPipe = fs.createReadStream(self.filepath, {
            start: self.byteCount,
            end: fs.statSync(self.filepath).size
        });
    } catch (e) {
        self.emit('error', new Error(e));
        return;
    }
    let health = setInterval(async function(){
        await self.getProgress(function(range) {
            if (typeof range !== 'undefined') {
                self.emit('progress', range);
            }
        });
    }, 1000);

    let stream;

    (async () => {
        try {
            stream = this.uploadPipe.pipe(got.stream.put(options))
        } catch(e) {
            console.log(e)
        }
    })().then(() => {
        stream.on('finish', () => {
            clearInterval(health);
            self.emit('success', 'Done uploading file');
        })

        stream.on('error', (err) => {
            self.emit('error', new Error(err));

            if ((self.retry > 0) || (self.retry <= -1)) {
                self.retry--;
                self.getProgress(function(range) {
                    if (typeof range !== 'undefined') {
                        self.byteCount = Number(range); //parse response
                    } else {
                        self.byteCount = 0;
                    }
                    self.send();
                });
            }
        })
    })
}

resumableUpload.prototype.getProgress = function(handler) {
    var self = this;

    (async () => {
        let range;
        try {
            this.uploadPipe.pause()
            await got.put(self.location)
        } catch (e) {
            range = e.response.headers['range'];
        }
        this.uploadPipe.resume()
        handler(range)
    })()

}

module.exports = resumableUpload;