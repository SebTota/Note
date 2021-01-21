const defaultSalt = 'FGJ4i8rVn0tvnwyu/HVNjQ==';
const obscureKey = 'SBaaHg5aDjMZ44pDaFf/dfsBN+4CyBXJczV399O2F0U='
const scryptCost = Math.pow(2, 16);  // N
const scryptBlockSize = 8;  // r
const scryptParallel = 1;  // p
const scryptMem = 128 * scryptParallel * scryptBlockSize + 128 * (2 + scryptCost) * scryptBlockSize;

const fs = require('fs');
const crypto = require('crypto');

const config = require('../modules/config');

module.exports = class Encryption {
    // Create key from user password and salt
    // If no salt is specified, the default salt is used
    static createAuthInfo(password, saveAuth, salt=defaultSalt) {

        let start = new Date().getTime();
        let key = crypto.scryptSync(password, salt, 32, {
            N: scryptCost,
            r: scryptBlockSize,
            p: scryptParallel,
            maxmem: scryptMem
        });
        let end = new Date().getTime();
        console.log("Time for scrypt[ms]: " + (end - start));

        config.setValue('auth_info.key', key.toString('base64'));
        config.setValue('auth_info.pass_salt', salt);

        if (saveAuth) {
            config.updateLocalConfigFile();
        }
    }

    static encrypt(text, key=config.getValue('auth_info.key'), encoding='base64') {
        if (key === null) return

        let startTime = new Date().getTime();
        let iv = crypto.randomBytes(16);

        const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(key, 'base64'), iv);

        let enc = cipher.update(text, 'utf8', encoding);
        enc += cipher.final(encoding);

        // console.log(`Encrypt time[ms]: ${(new Date().getTime()) - startTime}`)

        return iv.toString(encoding) + cipher.getAuthTag().toString(encoding) + enc;
    }

    static encryptName(text, key=config.getValue('auth_info.key')) {
        return this.encrypt(text, key, 'hex')
    }

    static hide(text) {
        return this.encrypt(text, obscureKey, 'base64')
    }

    // Return: string -> decypted text
    static decrypt(text, key=config.getValue('auth_info.key')) {
        if (text === null) return

        let startTime = new Date().getTime();

        const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(key, 'base64'), Buffer.from(text.substring(0, 24), 'base64'));
        decipher.setAuthTag(Buffer.from(text.substring(24, 48), 'base64'));

        let decryptedStr = decipher.update(text.substring(48), 'base64', 'utf8');
        try {
            decryptedStr += decipher.final('utf8');
        } catch(e) {
            throw { name: 'DecryptionFailed', message: 'Wrong key used for decryption'}
        }
        // console.log(`Decrypt time[ms]: ${(new Date().getTime()) - startTime}`)
        return decryptedStr
    }

    static decryptName(text, key=config.getValue('auth_info.key')) {
        // Change iv, auth tag, and data from hex to base64
        // Bug Fix: Must change each part individually because
        // concatenating multiple separate base64 strings can break encoding.
        let base64Str = Buffer.from(text.substring(0, 32), 'hex').toString('base64') +
            Buffer.from(text.substring(32, 64), 'hex').toString('base64') +
            Buffer.from(text.substring(64), 'hex').toString('base64');

        return this.decrypt(base64Str, key);
    }

    static show(text) {
        return this.decrypt(text, obscureKey, 'base64')
    }

    static encryptFileToDiskFromStringSync(text, filePath) {
        fs.writeFileSync(filePath, this.encrypt(text.replaceAll(new RegExp('src="data:image.*?\\"', "g"), 'src=""')));
    }

    static async encryptQuillOpsToDisk(ops, filePath, callback) {
        let startTime = new Date().getTime();
        ops.forEach(op => {
            if (op.hasOwnProperty('insert')) {
                if (op.insert.hasOwnProperty('image')) {
                    op.insert.image = ''
                }
            }
        })

        // this.encrypt(text.replaceAll(new RegExp('src="data:image.*?\\"', "g"), 'src=""'))
        console.log(`Testing time[ms]: ${(new Date().getTime()) - startTime}`)
        return fs.writeFile(filePath, this.encrypt(JSON.stringify(ops)), callback);
        // return fs.writeFile(filePath, this.encrypt(text.replaceAll(new RegExp('src="data:image.*?\\"', "g"), 'src=""')),callback);
    }

    static decryptFile(filePath) {
        if (fs.existsSync(filePath)) {
            return this.decrypt(fs.readFileSync(filePath).toString());
        } else {
            console.log(`Not found: ${filePath}`)
            throw { name: 'MissingFile', message: 'File not found' }
        }
    }

    static async decryptFileAsync(filePath, callback) {
        fs.exists(filePath, (exists) => {
            if (exists) {
                fs.readFile(filePath, (err, data) => {
                    if (err) {throw err}
                    callback(this.decrypt(data.toString()))
                })
            } else {
                console.log(`Not found: ${filePath}`)
                throw { name: 'MissingFile', message: 'File not found' }
            }
        })
    }

    static decryptPath(path) {
        if (typeof(path) !== 'string') return
        let pathSections = path.replace('//', '/').split('/');
        let decryptedPath = '';
        for (let i = 0; i < pathSections.length; i++) {
            let decryptedSection = '';
            try {
                decryptedSection = this.decryptName(pathSections[i]);
            } catch(e) {
                // This part of the path is already decrypted
                decryptedSection = pathSections[i]
            }
            decryptedPath = decryptedPath.concat(`/${decryptedSection}`)
        }
        return decryptedPath.replace('//', '/');
    }

    static randomSalt(bytes, encoding='base64') {
        if (typeof(bytes) === 'string') { bytes = parseInt(bytes) }
        if (typeof(encoding) !== 'string') return

        return crypto.randomBytes(bytes).toString(encoding)
    }
}