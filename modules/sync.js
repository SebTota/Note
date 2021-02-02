const config = require('../modules/config');
const googleAuth = require('../modules/providers/google-auth.js')

class Sync {
    constructor(){
        if (config.config.hasOwnProperty('drive')) {
            this.instance = new googleAuth('drive');
        } else {
            this.instance = undefined;
        }
    }

    initDrive() {
        this.instance = new googleAuth('drive');
    }
}

module.exports = Sync;