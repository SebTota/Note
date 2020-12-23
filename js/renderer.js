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

    var Size = Quill.import('attributors/style/size');
    Size.whitelist = ['12px','14px', '16px','18px','20px'];
    Quill.register(Size, true);

    var toolbarOptions = [
        ['bold', 'italic', 'underline', 'strike'],        // toggled buttons
        ['blockquote', 'code-block'],

        [{ 'header': 1 }, { 'header': 2 }],               // custom button values
        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
        [{ 'script': 'sub'}, { 'script': 'super' }],      // superscript/subscript
        [{ 'indent': '-1'}, { 'indent': '+1' }],          // outdent/indent
        [{ 'direction': 'rtl' }],                         // text direction

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

const fs = require('fs');
const {app} = require('electron').remote;

const userDataPath = app.getPath('userData');
const editor = document.querySelector('.ql-editor');

function updateEditorFromLocalFile(fileName) {
    if (document) {
        fs.readFile( userDataPath + '/' + fileName, function (err, data) {
            if (err) {
                throw err;
            }
            editor.innerHTML = data.toString();
            console.log("Read last local save from file.")
        });
    }
}

function initSaveFile(fileName) {
    if (document) {
        this.quill.on('text-change', () => {
            console.log(editor.innerHTML);
            fs.writeFileSync(userDataPath + '/' + fileName, editor.innerHTML);
        });
    }
}

updateEditorFromLocalFile("testingFile.html");
initSaveFile("testingFile.html");
