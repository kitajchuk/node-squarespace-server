/*!
 *
 * Squarespace utility functions.
 *
 */
var fs = require( "fs" ),
    path = require( "path" ),
    rSpaces = /^\s+|\s+$/,
    rAttrs = /(\w+)=("[^<>"]*"|'[^<>']*'|\w+)/g,
    rQuote = /\'|\"/g,
    rBreaks = /\n|\r|\t|\v/,


log = function () {
    var args = [].slice.call( arguments, 0 ),
        sqsc = path.join( process.cwd(), ".sqs-cache" ),
        logs = path.join( sqsc, ".logs" ),
        data = "";

    args.unshift( "> sqs-server:" );

    console.log.apply( console, args );

    /* Not yet anyway...
    if ( fs.existsSync( logs ) ) {
        data = ("" + fs.readFileSync( logs ));

        fs.unlinkSync( logs );
    }

    args.unshift( (new Date() + "\n") );

    data += (args.join( " " ) + "\n\n");

    if ( fs.existsSync( sqsc ) ) {
        fs.writeFileSync( logs, data );
    }
    */
},

readJson = function ( path ) {
    return JSON.parse( ("" + fs.readFileSync( path )) );
},

readFileSquashed = function ( path ) {
    return squashContent( readFile( path ) );
},

readFile = function ( path ) {
    return ("" + fs.readFileSync( path ));
},

squashContent = function ( content ) {
    content = content.split( rBreaks );
    content.forEach(function ( el, i ) {
        content[ i ] = el.replace( rSpaces, "" );
    });
    content = content.join( "" );

    return content;
},

writeJson = function ( path, content ) {
    if ( fs.existsSync( path ) ) {
        fs.unlinkSync( path );
    }

    fs.writeFileSync( path, JSON.stringify( content ) );
},

writeFile = function ( path, content ) {
    if ( fs.existsSync( path ) ) {
        fs.unlinkSync( path );
    }

    fs.writeFileSync( path, content );
},

getAttrObj = function ( elem ) {
    var attrs = elem.match( rAttrs ),
        obj = {};

    for ( var i = attrs.length; i--; ) {
        var attr = attrs[ i ].split( "=" );

        obj[ attr[ 0 ] ] = attr[ 1 ].replace( rQuote, "" );
    }

    return obj;
},

getToken = function () {
    return ("token-" + Date.now() + ("" + Math.floor( (Math.random() * 1000000) + 1 )));
};


module.exports = {
    log: log,
    readJson: readJson,
    readFile: readFile,
    readFileSquashed: readFileSquashed,
    squashContent: squashContent,
    writeJson: writeJson,
    writeFile: writeFile,
    getAttrObj: getAttrObj,
    getToken: getToken
};