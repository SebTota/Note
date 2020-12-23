var quill;

function initQuill() {
    hljs.configure({   // optionally configure hljs
        languages: ['javascript', 'python', 'html']
    });

    var toolbarOptions = [
        ['bold', 'italic', 'underline', 'strike'],        // toggled buttons
        ['blockquote', 'code-block'],

        [{ 'header': 1 }, { 'header': 2 }],               // custom button values
        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
        [{ 'script': 'sub'}, { 'script': 'super' }],      // superscript/subscript
        [{ 'indent': '-1'}, { 'indent': '+1' }],          // outdent/indent
        [{ 'direction': 'rtl' }],                         // text direction

        [{ 'size': ['small', false, 'large', 'huge'] }],  // custom dropdown
        [{ 'header': [1, 2, 3, 4, 5, 6, false] }],

        [{ 'color': [] }, { 'background': [] }],          // dropdown with defaults from theme
        [{ 'font': [] }],
        [{ 'align': [] }],

        ['clean']                                         // remove formatting button
    ];
    quill = new Quill('#editor', {
        modules: {
            syntax: true,
            toolbar: toolbarOptions
        },
        theme: 'snow'
    });
}

function initSaveFile(fileName) {
    if (document) {
        const fs = require('fs');
        const {app} = require('electron').remote;

        const userDataPath = app.getPath('userData');
        console.log(userDataPath);

        const editor = document.querySelector('.ql-editor');

        this.quill.on('text-change', () => {
            console.log(editor.innerHTML);
            fs.writeFileSync(userDataPath + "/" + fileName, editor.innerHTML);
        });
    }
}

initQuill();
initSaveFile("testingFile.html");
