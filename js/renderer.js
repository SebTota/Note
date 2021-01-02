var quill;

function initQuill() {
    hljs.configure({   // optionally configure hljs
        languages: ['javascript', 'python', 'html']
    });
    // Fixed error with image local src not passing sanitization
    var Image = Quill.import('formats/image');
    Image.sanitize = function(url) {
        return url;
    };

    // Add 'alt' value to image (used for encrypting the image locally and storing the local path)
    class CustomImage extends Image {
        static create(data) {
            let filePath = "";
            if (data !== "") {
                const fileExt = data.split(',')[0].split('/')[1].split(';')[0];
                const fileName = require('uuid').v4() + "." + fileExt;
                filePath = currentFile['relativePath'] + "/assets/" + fileName + ".enc";

                // Make sure assets directory exists for file
                if (!fs.existsSync(currentFile['dirPath'] + "/assets")) {
                    fs.mkdirSync(currentFile['dirPath'] + "/assets");
                }

                fs.writeFile(userDataPath + "/" + filePath, encrypt(data.toString('hex')), function(err) {
                    if (err) {
                        console.log(err);
                    }
                });
            }

            const node = super.create(data);
            node.setAttribute('src', data);
            node.setAttribute('alt', filePath);

            return node;

        }
    }
    Quill.register(CustomImage, true);

    var toolbarOptions = [
        ['bold', 'italic', 'underline', 'strike'],        // toggled buttons
        ['blockquote', 'code-block'],

        [{ 'header': 1 }, { 'header': 2 }],               // custom button values
        [{ 'list': 'ordered'}, { 'list': 'bullet' }, { 'list': 'check' }],
        [{ 'script': 'sub'}, { 'script': 'super' }],      // superscript/subscript
        [{ 'indent': '-1'}, { 'indent': '+1' }],          // outdent/indent
        [{ 'direction': 'rtl' }],                         // text direction
        [ 'link', 'image', 'formula' ],

        [{ 'header': [1, 2, 3, 4, 5, 6, false] }],

        [{ 'color': [] }, { 'background': [] }],          // dropdown with defaults from theme
        [{ 'font': [] }],
        [{ 'align': [] }],

        ['clean']                                         // remove formatting button
    ];

    quill = new Quill('#editor', {
        modules: {
            syntax: true,
            imageResize: {
                displaySize: true
            },
            imageDrop: true,
            toolbar: toolbarOptions
        },
        theme: 'snow'
    });
}
initQuill();

const editor = document.querySelector('.ql-editor');

function updateEditorFromLocalFile(filePath) {
    // Check if file exists locally
    if (!fs.existsSync(filePath)){
        console.log("Opening file failed: File doesn't exist locally.")
        return;
    }

    if (document) {
        quill.clipboard.dangerouslyPasteHTML(decryptFile(filePath), 'user');
        const currImgs = Array.from(quill.container.firstChild.getElementsByTagName("img"));

        for (let i = 0; i < currImgs.length; i++) {
            currImgs[i].setAttribute('src', decryptFile(userDataPath + "/" + currImgs[i].getAttribute('alt')));
        }

        console.log("finished reading file");
    }
}

function imageHandler(delta, oldDelta, source) {
    let currrentContents = quill.getContents();
    let diff = currrentContents.diff(oldDelta);

    const currImgs = Array.from(quill.container.firstChild.getElementsByTagName("img"));
    const currImgsSrc = []

    // Confirm image deletion
    currImgs.forEach(img => {
        currImgsSrc.push(img.alt);
    })

    for (let i = 0; i < diff.ops.length; i++) {
        if (diff.ops[i].hasOwnProperty('attributes') && diff.ops[i]['attributes']['alt']) {
            // Image has been deleted
            const imgPath = diff.ops[i]['attributes']['alt'];

            if (!currImgsSrc.includes(imgPath)) {
                // Delete image locally
                fs.unlink(userDataPath + "/" + decodeURI(imgPath), (err) => {
                    if (err) throw err;
                    console.log('Image deleted from local folder');
                });
            }
        }
    }
}

function initSaveFile(filePath) {
    if (document) {
        this.quill.on('text-change', (delta, oldDelta, source) => {
            if (!writing) {
                writing = true;
                imageHandler(delta, oldDelta, source);
                encryptFileToDiskFromString(editor.innerHTML, filePath)
            }
        });
    }
}

function openFile(dirPath) {
    // Resent on text-change event if one exists
    this.quill['emitter']['_events']['text-change'] = undefined;

    currentFile['dirPath'] = userDataPath + "/" + dirPath;
    currentFile['relativePath'] = dirPath;
    currentFile['fileName'] = dirPath.split("/")[dirPath.split("/").length - 1];
    currentFile['filePath'] = currentFile['dirPath'] + "/" + currentFile['fileName'] + ".enc";

    updateEditorFromLocalFile(currentFile['filePath']);
    initSaveFile(currentFile['filePath']);

    return true;
}

function newFolder(dirPath) {
    // Check if directory already exists
    if (fs.existsSync(userDataPath + "/" + dirPath)){
        console.log("Failed creating new folder. Folder already exists!")
        return false;
    } else {
        fs.mkdirSync(userDataPath + "/" + dirPath);
        console.log("New folder created!");
    }

}

function newFile(dirPath) {
    currentFile['relativePath'] = dirPath;
    currentFile['dirPath'] = userDataPath + "/" + dirPath;
    currentFile['fileName'] = dirPath.split("/")[dirPath.split("/").length - 1];
    currentFile['filePath'] = currentFile['dirPath'] + "/" + currentFile['fileName'] + ".enc";

    console.log(currentFile);

    // Check if directory already exists
    if (!fs.existsSync(currentFile['dirPath'])) {
        fs.mkdirSync(currentFile['dirPath']);
    }

    // Check if directory already exists
    if (!fs.existsSync(currentFile['dirPath']) + "/assets") {
        fs.mkdirSync(currentFile['dirPath'] + "/assets");
    }

    if (fs.existsSync(currentFile['filePath'])) {
        console.log("Failed creating new file: File already exists! Trying to open existing file.");
        openFile(dirPath);
        return
    }

    initSaveFile(currentFile['filePath']);
}

// openFile("testdir/abc123")
// newFolder("testdir");
// newFile("testdir/abc123");
