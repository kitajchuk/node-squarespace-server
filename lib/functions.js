/*!
 *
 * Squarespace utility functions.
 *
 */
var fs = require( "fs" ),
    path = require( "path" ),
    phpjs = require( "phpjs" ),
    rSpaces = /^\s+|\s+$/,
    rAttrs = /(\w+)=("[^<>"]*"|'[^<>']*'|\w+)/g,
    rQuote = /\'|\"/g,
    rBreaks = /\n|\r|\t|\v/,


log = function () {
    var args = [].slice.call( arguments, 0 );

    args.unshift( "> sqs-server:" );

    console.log.apply( console, args );
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
        var attr = attrs[ i ].split( "=" ),
            val = attr[ 1 ].replace( rQuote, "" );

        // Normalize values

        // Empty ?
        // Skip empties, they are `undefined`
        if ( val === "" ) {
            continue;
        }

        // False ?
        if ( val === "false" ) {
            val = false;
        }

        // True ?
        if ( val === "true" ) {
            val = true;
        }

        // Numeric ?
        if ( phpjs.is_numeric( val ) ) {
            val = parseInt( val, 10 );
        }

        obj[ attr[ 0 ] ] = val;
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