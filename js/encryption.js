function encrypt(text, key=config['auth_info']['key'], outputEncoding='base64') {
    if (key === null) return

    let startTime = new Date().getTime();
    let iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);

    let enc = cipher.update(text, 'utf8', outputEncoding);
    enc += cipher.final(outputEncoding);

    console.log(`Encrypt time[ms]: ${(new Date().getTime()) - startTime}`)
    return iv.toString('hex') + cipher.getAuthTag().toString('hex') + enc;
}

function encryptDirPath(text, key=config['auth_info']['key']) {
    return encrypt(text, key, 'hex');
}

// Return: string -> decypted text
function decrypt(text, key=config['auth_info']['key'], inputEncoding='base64') {
    if (text === null) return

    let startTime = new Date().getTime();

    const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), Buffer.from(text.substring(0, 32), 'hex'));
    decipher.setAuthTag(Buffer.from(text.substring(32, 64), 'hex'));

    let decryptedStr = decipher.update(text.substring(start=64), inputEncoding, 'utf8');
    try {
        decryptedStr += decipher.final('utf8');
    } catch(e) {
        throw IncorrectDecryptionKeyError;
    }
    console.log(`Decrypt time[ms]: ${(new Date().getTime()) - startTime}`)
    return decryptedStr
}

function encryptFileToDiskFromStringSync(text, filePath) {
    fs.writeFileSync(filePath, encrypt(text.replaceAll(new RegExp('src="data:image.*?\\"', "g"), 'src=""')));
}

async function encryptFileToDiskFromString(text, filePath) {
    fs.writeFile(filePath, encrypt(text.replaceAll(new RegExp('src="data:image.*?\\"', "g"), 'src=""')), function() {writing = false;});
}

function decryptFile(filePath) {
    if (fs.existsSync(filePath)) {
        return decrypt(fs.readFileSync(filePath).toString());
    } else {
        console.log(`Not found: ${filePath}`)
        throw MissingFileError
    }
}