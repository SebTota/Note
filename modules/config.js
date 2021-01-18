const fs = require('fs');
const {app} = require('electron').remote;

const configFilePath = app.getPath('userData') + '/config.json';

class Config {
    constructor(){
        this.config = {}
        this.readLocalConfigFile()
    }

    // Read local config file
    readLocalConfigFile() {
        if (fs.existsSync(configFilePath)){
            let configFileRaw = fs.readFileSync(configFilePath);
            this.config = JSON.parse(configFileRaw);
            return true;
        }
        // Config file doesn't exist locally
        return false;
    }

    // Save config file locally
    updateLocalConfigFile() {
        fs.writeFileSync(configFilePath, JSON.stringify(this.config));
    }

    getUserCredentials() {
        return config.authInfo
    }

    // Set value in config variable
    // Note: Key MUST be in dot notation
    // EX: getValue('key1.key2');
    getValue(key) {
        if(typeof(key) != 'string') return
        return key.split('.').reduce((p,c)=>p&&p[c]||null, this.config)
    }

    setValue(key, value, updateLocalFile=true) {
        if(typeof(key) !== 'string' || typeof(value) !== 'string') return
        key.split('.').reduce((o,p,i) => o[p] = key.split('.').length === ++i ? value : o[p] || {}, this.config)
        if (updateLocalFile) { this.updateLocalConfigFile() }
    }

}

// Make sure only one config object can ever exist
if (!global.configHandler) {
    global.configHandler = new Config();
    module.exports = configHandler;
} else {
    module.exports = global.configHandler;
}

