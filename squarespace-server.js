/*!
 *
 * Squarespace node server.
 *
 * @todo: squarespace:navigation
 * @todo: squarespace:query
 * @todo: squarespace:script
 * @todo: squarespace-headers
 * @todo: squarespace-footers
 * @todo: squarespace.main-content
 * @todo: /assets/[...] - asset serving from .server dir
 * @todo: {@|apply [...].block}
 * @todo: BadFormatters
 * @todo: BadPredicates
 * @todo: server.conf for settings
 *
 */
var express = require( "express" ),
    request = require( "request" ),
    app = express(),
    path = require( "path" ),
    http = require( "http" ),
    fs = require( "fs" ),
    jsont = require( "./lib/jsontemplate" ),
    matcher = require( "./lib/matchroute" ),

    SS_CONTENT = "{squarespace.main-content}",
    SS_HEADERS = "{squarespace-headers}",
    SS_FOOTERS = "{squarespace-footers}",

    headers = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_9_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/37.0.2062.94 Safari/537.36" }
    server = {},

    rSpaces = /^\s+|\s+$/,
    r2Hundo = /^(20\d|1223)$/,
    rBlocks = /\{\@\|apply\s(.*?)\}/g,
    rBlockTags = /^\{\@\|apply\s|\}$/g,
    rRegion = /\.region$/,
    rItemOrList = /\.item$|\.list$/,
    rHeader = /header/,
    rFooter = /footer/,
    rAttrs = /(\w+)=("[^<>"]*"|'[^<>']*'|\w+)/g,
    rQueries = /\<squarespace:query(.*?)\<\/squarespace:query\>/g,
    rNavis = /\<squarespace:navigation(.*?)\/\>/g,
    rScripts = /\<squarespace:script(.*?)\/\>/g,

undefined_str = "",

more_predicates = function ( predicate_name ) {
    if ( predicate_name === "authenticatedAccount" ) {
        return function () {
            return false;
        };
    }
},

more_formatters = function ( formatter_name ) {
    
};

function readFile( path ) {
    var content;

    content = ("" + fs.readFileSync( path )).split( "\n" );
    content.forEach(function ( el, i ) {
        content[ i ] = el.replace( rSpaces, "" );
    });
    content = content.join( "" );

    return content;
}

function writeFile( path, content ) {
    if ( fs.existsSync( path ) ) {
        fs.unlinkSync( path );
    }

    fs.writeFileSync( path, content );
}

function getAttrObj( elem ) {
    var attrs = elem.match( rAttrs ),
        obj = {};

    for ( var i = attrs.length; i--; ) {
        var attr = attrs[ i ].split( "=" );

        obj[ attr[ 0 ] ] = attr[ 1 ].replace( /\'|\"/g, "" );
    }

    return obj;
}

/**
 *
 * siteurl: string
 * password: string
 * port: number,
 * routes: object
 * ---
 * gitroot: cwd
 * webroot: .server
 *
 */
server.init = function ( options ) {
    var url = options.siteurl,
        qrs = {
            format: "json"
        },
        len,
        i,
        j;

    if ( !options.port ) {
        options.port = 5050;
    }

    if ( options.password ) {
        qrs.password = options.password;
    }

    if ( !options.gitroot ) {
        options.gitroot = process.cwd();
    }

    if ( !options.webroot ) {
        options.webroot = path.join( options.gitroot, ".server" );

        if ( !fs.existsSync( options.webroot ) ) {
            fs.mkdirSync( options.webroot );
        }

        if ( !fs.existsSync( path.join( options.webroot, "scripts" ) ) ) {
            fs.mkdirSync( path.join( options.webroot, "scripts" ) );
        }

        if ( !fs.existsSync( path.join( options.webroot, "assets" ) ) ) {
            fs.mkdirSync( path.join( options.webroot, "assets" ) );
        }
    }

    var templateConf = JSON.parse( readFile( path.join( options.gitroot, "template.conf" ) ) );
    var blockDir = path.join( options.gitroot, "blocks" );
    var collectionDir = path.join( options.gitroot, "collections" );
    var assetDir = path.join( options.gitroot, "assets" );
    var pageDir = path.join( options.gitroot, "pages" );
    var scriptDir = path.join( options.gitroot, "scripts" );
    var styleDir = path.join( options.gitroot, "styles" );
    var collections = fs.readdirSync( collectionDir );
    var allFiles = fs.readdirSync( options.gitroot );
    var regions = [];
    var header;
    var footer;

    // Header/Footer Templates
    for ( i = allFiles.length; i--; ) {
        if ( rRegion.test( allFiles[ i ] ) && rHeader.test( allFiles[ i ] ) ) {
            header = path.join( options.gitroot, allFiles[ i ] );

        } else if ( rRegion.test( allFiles[ i ] ) && rFooter.test( allFiles[ i ] ) ) {
            footer = path.join( options.gitroot, allFiles[ i ] );
        }
    }

    // Collection Templates
    for ( i = collections.length; i--; ) {
        if ( rItemOrList.test( collections[ i ] ) ) {
            var cont = "";
            var file = path.join( collectionDir, collections[ i ] );
            var link = path.join( options.webroot, collections[ i ] );
            var files = [header, file, footer];

            for ( j = 0, len = files.length; j < len; j++ ) {
                cont += readFile( files[ j ] );
            }

            writeFile( link, cont );
        }
    }

    // Region Templates
    for ( i in templateConf.layouts ) {
        var files = templateConf.layouts[ i ].regions;
        var file = "";
        var link = path.join( options.webroot, (templateConf.layouts[ i ].name.toLowerCase() + ".region") );

        for ( j = 0, len = files.length; j < len; j++ ) {
            file += readFile( path.join( options.gitroot, (files[ j ] + ".region") ) );
        }

        writeFile( link, file );
    }

    app.use( express.static( options.webroot ) );
    app.set( "port", options.port );
    app.get( "*", function ( req, res ) {
        console.log( "> squarespace-server GET - " + req.url );

        request({
            url: url,
            json: true,
            headers: headers,
            qs: qrs

        }, function ( error, response, body ) {
            var filepath,
                template,
                matched,
                filed,
                block,
                attrs;

            if ( error ) {
                res.send( "> squarespace-server error" );
            }

            // Do 1xx / 2xx
            if ( r2Hundo.test( response.statusCode ) ) {
                // For jsont processing
                body.more_formatters = more_formatters;
                body.more_predicates = more_predicates;
                body.undefined_str = undefined_str;

                for ( var r in options.routes ) {
                    matched = matcher.compare( r, req.url );

                    // Route matched so do work
                    if ( matched.match ) {
                        // File Path
                        filepath = path.join( options.webroot, options.routes[ r ] );

                        // Template
                        template = readFile( filepath );

                        // Blocks
                        matched = template.match( rBlocks );

                        for ( i = matched.length; i--; ) {
                            block = matched[ i ].replace( rBlockTags, "" );
                            filed = readFile( path.join( blockDir, block ) );

                            template = template.replace( matched[ i ], filed );
                        }

                        // Navigations
                        matched = template.match( rNavis );

                        for ( i = matched.length; i--; ) {
                            attrs = getAttrObj( matched[ i ] );
                            block = (attrs.template + ".block");
                            filed = readFile( path.join( blockDir, block ) );

                            template = template.replace( matched[ i ], filed );
                        }

                        // Scripts
                        matched = template.match( rScripts );

                        for ( i = matched.length; i--; ) {
                            attrs = getAttrObj( matched[ i ] );
                            block = ( "/scripts/" + attrs.src );
                            filed = '<script src="' + block + '"></script>';

                            template = template.replace( matched[ i ], filed );

                            // Copy file to .server/scripts/[block]
                        }

                        // Queries
                        matched = template.match( rQueries );
                        console.log( "Queries" );
                        console.log( matched );
                        console.log( "" );

                        // Render w/jsontemplate

                    }
                }

                res.status( 200 ).send( template );

            // Do 4xx / 5xx
            } else {
                
            }
        });
    });

    http.Server( app ).listen( app.get( "port" ) );

    console.log( "> squarespace-server running on port " + app.get( "port" ) );
};

module.exports = server;