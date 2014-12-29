var gulp = require('gulp');
var watch = require('gulp-watch');
var connect = require('gulp-connect');
var jshint = require('gulp-jshint');
var inject = require("gulp-inject");
var staticsource = "";
var merge = require('merge-stream');
var clean = require('gulp-clean');
var Path = require('path');
var uglify = require("gulp-uglify");
var concat = require("gulp-concat");
var fs = require("fs");
var crypto = require('crypto');
var cssmin = require('gulp-cssmin');
var imagemin = require('gulp-imagemin');
var Stream = require("stream");
var Q = require("q");
var ejs = require("ejs");

var config = require("./config/config.json");
var buildMode = config.buildMode;
var previewMode = config.previewMode;
var pages = config.pages;
var basePath = config.path;
var curPage = config.developPage;

var argv = require("yargs").argv;
var inlineHtmlReg = /(__inline\(['"])([^'"]+)(['"]\))/g;

var bd = {};
var bdutls = require("./utils.js");

var cssurl = getURLList('css', curPage);
var jsurl = getURLList('js', curPage);
var imgurl = getURLList('imgs', curPage);
var htmlurl = getURLList('html', curPage);

function getMd5(str, len) {
    var md5um = crypto.createHash('md5');
    md5um.update(str, 'utf-8');
    return md5um.digest('hex').substring(0, len);
}
function reloadPage(page) {
    gulp.src(basePath.pagebuild + page + '/*.html').pipe(connect.reload());
}

function calcMd5(chunk, parsedPath) {
    var _md5 = getMd5(chunk.contents, 6);
    var path = parsedPath.basename + "_" + _md5 + parsedPath.extname;
    chunk.path = Path.join(chunk.base, path);
    return chunk;
}
function replaceHTML(chunk, encoding) {
    var data = chunk.contents.toString(encoding);
    var basePath = bdutls.realPath(chunk.base);
    data = data.replace(inlineHtmlReg, function (m, $1, $2, $3) {
        var _path = bdutls.absPath($2, basePath);
        var text = fs.readFileSync(_path, encoding);
        text = bdutls.replaceQuotes(text);
        return "'" + text + "'";
    });
    var buf = new Buffer(data);
    chunk.contents = buf;
    return chunk;
}
gulp.task('lh', function () {
    gulp.src("./src/pages/index/js/index.js").pipe(compile()).pipe(gulp.dest("./build"));
});
function compile() {
    var stream = new Stream.Transform({objectMode: true});
    stream._transform = function (chunk, encoding, done) {
        var parsedPath = parsePath(chunk.relative);
        if (parsedPath.extname == ".js") {
            chunk = replaceHTML(chunk, encoding);
        }
        chunk = calcMd5(chunk, parsedPath);
        this.push(chunk);
        done(null, chunk);
    };
    return stream;
}

function parsePath(path) {
    var extname = Path.extname(path);
    return {
        dirname: Path.dirname(path),
        basename: Path.basename(path, extname),
        extname: extname
    };
}
function getURLList(type, page) {
    if (type == 'html') {
        return {
            pagesrc:   basePath.pagesrc + page + "/index.html",
            pagebuild: basePath.pagebuild + page + "/"
        }
    }
    var urls = {
        pagesrc:     basePath.pagesrc + page + "/" + type + "/*",
        pagebuild:   basePath.pagebuild + page + "/" + type + "/",
        commonsrc:   basePath.commonsrc + type + "/*",
        commonbuild: basePath.commonbuild + type + "/"
    }
    return urls;
}
function concatFile(type, pageurl) {
    var func = type === 'css' ? cssmin : uglify;
    var opts = type === 'css' ? {'noAdvanced': true} : {};
    if (type === "imgs") {
        return merge(
        gulp.src(pageurl.pagesrc).pipe(imagemin()).pipe(gulp.dest(pageurl.pagebuild)),
        gulp.src(pageurl.commonsrc).pipe(imagemin()).pipe(gulp.dest(pageurl.commonbuild))
        );

    } else {
        return merge(gulp.src(pageurl.pagesrc).pipe(concat("main." + type)).pipe(func(opts)).pipe(compile()).pipe(gulp.dest(pageurl.pagebuild)),
        gulp.src(pageurl.commonsrc).pipe(concat("base." + type)).pipe(func(opts)).pipe(compile()).pipe(gulp.dest(pageurl.commonbuild)));
    }

}
function insertStatic() {
    return gulp.src(htmlurl.pagebuild + "index.html").pipe(inject(gulp.src([jsurl.pagebuild + "*.js"]), {
        relative: true,
        name: 'pagejs',
        addPrefix: staticsource
    })).pipe(inject(gulp.src([jsurl.commonbuild + "*.js"]), {
        relative: true,
        name: 'basejs',
        addPrefix: staticsource
    })).pipe(inject(gulp.src([cssurl.pagebuild + "*.css"]), {
        relative: true,
        name: 'pagecss',
        addPrefix: staticsource
    })).pipe(inject(gulp.src([cssurl.commonbuild + "*.css"]), {
        relative: true,
        name: 'basecss',
        addPrefix: staticsource
    })).pipe(gulp.dest(htmlurl.pagebuild));
}

gulp.task('concat', ['move'], function () {
    console.log('concat');
    return merge(
    concatFile('css', cssurl),
    concatFile('js', jsurl),
    concatFile('imgs', imgurl)
    );

});
gulp.task('build', ['concat'], function () {
    console.log('build');
    return insertStatic({
        cssurl: cssurl,
        jsurl: jsurl,
        imgurl: imgurl,
        htmlurl: htmlurl
    });
});
gulp.task("clean", function () {
    var page = curPage;
    var pageUrl = basePath.pagebuild + page;
    var stream1 = gulp.src(basePath.commonbuild, {read: false}).pipe(clean());
    var stream2 = gulp.src(pageUrl, {read: false}).pipe(clean());
    return merge(stream1, stream2);
});
gulp.task("move", ["clean"], function () {
    var page = curPage;
    var htmlurl = getURLList('html', page);
    return gulp.src(htmlurl.pagesrc).pipe(gulp.dest(htmlurl.pagebuild));
});

gulp.task("server", function () {
    if (!config.startServer) return;
    connect.server({
        port: 8003,
        root: "",
        livereload: true,
        addRootSlash: false
    });
    var open = require('open');
    open('http://127.0.0.1:8003/build/develop/pages/' + curPage);
});
gulp.task("watch", function () {
    gulp.run('server');
    gulp.run('build');
    var staticSrc = [basePath.pagesrc + curPage + '/*', basePath.pagesrc + curPage + '/**/*', basePath.pagesrc + curPage + '/**/**/*'];
    var commonSrc = [basePath.commonsrc + '/*', basePath.commonsrc + '/**/*', basePath.commonsrc + '/**/**/*'];
    gulp.watch(staticSrc.concat(commonSrc), function () {
        gulp.run('reload');
    });

});
gulp.task('reload', ['build'], function () {
    reloadPage(curPage);
});
function newPage(pageName) {
    var fileToMove = ["./src/pages/_example/*", "./src/pages/_example/**/*"];
    gulp.src(fileToMove).pipe(gulp.dest('./src/pages/' + pageName));
}
gulp.task('new', function () {
    var pageName = argv.name;
    if (!pageName) {
        for (var i = 0, l = pages.length; i < l; i++) {
            pageName = pages[i];
            var fileurl = './src/pages/' + pageName;
            path.exists(fileurl, function (exists) {
                if (!exists) {
                    newPage(pageName);
                }
            });
        }
    } else {
        newPage(pageName);
    }
});
var through = require('through2');
gulp.task('test', function () {
    gulp.src('./src/pages/index/css/index.css')
    .pipe(cssmin())
    .pipe(function () {
        return through(function (line) {
            console.log(line);
        });
    })
    .pipe(gulp.dest('./sample'));
});





