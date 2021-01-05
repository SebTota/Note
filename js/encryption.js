function encrypt(text, key=config['auth_info']['key']) {
    let iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);

    let enc = cipher.update(text, 'utf8', 'base64');
    enc += cipher.final('base64');
    return iv.toString('hex') + ':' + cipher.getAuthTag().toString('hex') + ':' + enc;
}

// Return [boolean, string]
// boolean: true if correctly decrypted, false if decryptio failed (wrong key)
// string: decrypted string if boolean is true, empty string if boolean is false
function decrypt(text, key=config['auth_info']['key']) {
    let textParts = text.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), Buffer.from(textParts[0], 'hex'));
    decipher.setAuthTag(Buffer.from(textParts[1], 'hex'));
    let str = decipher.update(textParts[2], 'base64', 'utf8');
    try {
        str += decipher.final('utf8');
    } catch(e) {
        console.log('Incorrect key provided!');
        return [false, '']
    }
    return [true, str];
}

function encryptFileToDiskFromStringSync(text, filePath) {
    fs.writeFileSync(filePath, encrypt(text.replaceAll(new RegExp('src="data:image.*?\\"', "g"), 'src=""')));
}

async function encryptFileToDiskFromString(text, filePath) {
    fs.writeFile(filePath, encrypt(text.replaceAll(new RegExp('src="data:image.*?\\"', "g"), 'src=""')), function() {writing = false;});
}

function decryptFile(filePath) {
    // Make sure file exists before trying to decrypt file
    if (fs.existsSync(filePath)) {
        const encString = fs.readFileSync(filePath).toString();
        return decrypt(encString);
    } else {
        return false
    }
}