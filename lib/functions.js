var fs = require( "fs" ),
    rSpaces = /^\s+|\s+$/,
    rAttrs = /(\w+)=("[^<>"]*"|'[^<>']*'|\w+)/g,
    rQuote = /\'|\"/g;

module.exports = {
    log: function () {
        var args = [].slice.call( arguments, 0 );

        args.unshift( "> squarespace-server:" );

        console.log.apply( console, args );
    },

    readJson: function ( path ) {
        return JSON.parse( ("" + fs.readFileSync( path )) );
    },

    readFile: function ( path ) {
        var content;

        content = ("" + fs.readFileSync( path )).split( "\n" );
        content.forEach(function ( el, i ) {
            content[ i ] = el.replace( rSpaces, "" );
        });
        content = content.join( "" );

        return content;
    },

    squashHtml: function ( content ) {
        content = content.split( "\n" );
        content.forEach(function ( el, i ) {
            content[ i ] = el.replace( rSpaces, "" );
        });
        content = content.join( "" );

        return content;
    },

    writeJson: function ( path, content ) {
        if ( fs.existsSync( path ) ) {
            fs.unlinkSync( path );
        }

        fs.writeFileSync( path, JSON.stringify( content ) );
    },

    writeFile: function ( path, content ) {
        if ( fs.existsSync( path ) ) {
            fs.unlinkSync( path );
        }

        fs.writeFileSync( path, content );
    },

    getAttrObj: function ( elem ) {
        var attrs = elem.match( rAttrs ),
            obj = {};

        for ( var i = attrs.length; i--; ) {
            var attr = attrs[ i ].split( "=" );

            obj[ attr[ 0 ] ] = attr[ 1 ].replace( rQuote, "" );
        }

        return obj;
    }
};