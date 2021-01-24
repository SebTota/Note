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

    // Update specific key in config file
    // Note: This doesn't update the entire config variable
    updateLocalConfigFile(key) {
        fs.exists(configFilePath, (exists => {
            let configFile = {};
            if (!exists) {
                logger.info(`No local config file found when trying to update key. Creating new config file.`);
                this.setValue(key, this.getValue(key), false, configFile)
                fs.writeFileSync(configFilePath, JSON.stringify(configFile));
            } else {
                // Read local config file
                fs.readFile(configFilePath, (err, data) => {
                    if (err) logger.error(err)
                    configFile = JSON.parse(data);
                    // Update specified key from local config variable
                    key.split('.').reduce((o,p,i) => o[p] = key.split('.').length === ++i ? value : o[p] || {}, configFile)
                    // Resave local config file, only updating specified key
                    fs.writeFileSync(configFilePath, JSON.stringify(configFile));
                })
            }
        }))

    }

    // Set value in config variable
    // Note: Key MUST be in dot notation
    // EX: getValue('key1.key2');
    getValue(key, jsonObj=this.config) {
        if(typeof(key) != 'string') return
        return key.split('.').reduce((p,c)=>p&&p[c]||null, jsonObj)
    }

    setValue(key, value, updateLocalFile=false, jsonObj=this.config) {
        if(typeof(key) !== 'string' || typeof(value) !== 'string') return
        key.split('.').reduce((o,p,i) => o[p] = key.split('.').length === ++i ? value : o[p] || {}, jsonObj)
        if (updateLocalFile) { this.updateLocalConfigFile(key) }
    }

}

// Make sure only one config object can ever exist
if (!global.configHandler) {
    global.configHandler = new Config();
    module.exports = configHandler;
} else {
    module.exports = global.configHandler;
}

