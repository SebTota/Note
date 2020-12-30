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
                filePath = userDataPath + '/files/' + fileName + ".enc";

                fs.writeFile(filePath, encryption.encrypt(data.toString('hex')), function(err) {
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

    var Size = Quill.import('attributors/style/size');
    Size.whitelist = ['12px','14px', '16px','18px','20px'];
    Quill.register(Size, true);

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
        [{ 'size': ['12px','14px', '16px','18px','20px'] }],

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
const encryption = require('./js/encryption');

function updateEditorFromLocalFile(fileName) {
    if (document) {
        quill.clipboard.dangerouslyPasteHTML(encryption.decryptFile(userDataPath + "/" + fileName), 'user');
        const currImgs = Array.from(quill.container.firstChild.getElementsByTagName("img"));

        for (let i = 0; i < currImgs.length; i++) {
            currImgs[i].setAttribute('src', encryption.decryptFile(currImgs[i].getAttribute('alt')));
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
            console.log(diff.ops[i]['attributes']['alt']);

            // Image has been deleted
            const imgPath = diff.ops[i]['attributes']['alt'];

            if (!currImgsSrc.includes(imgPath)) {
                // Delete image locally
                fs.unlink(decodeURI(imgPath), (err) => {
                    if (err) throw err;
                    console.log('Image deleted from local folder');
                });
            }
        }
    }
}

function initSaveFile(fileName) {
    encryption.chooseFileToEncrypt(userDataPath, fileName);

    if (document) {
        this.quill.on('text-change', (delta, oldDelta, source) => {
            // console.log(editor.innerHTML);
            // fs.writeFileSync(userDataPath + '/' + fileName, editor.innerHTML);
            imageHandler(delta, oldDelta, source);

            // let path = userDataPath + '/' + fileName;
            encryption.encryptFileToDiskFromString(editor.innerHTML)
        });
    }
}

updateEditorFromLocalFile("test.txt.enc");
initSaveFile("test.txt.enc");
