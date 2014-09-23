/*!
 *
 * Squarespace node server.
 *
 * @todo: squarespace:query
 * @todo: squarespace-headers
 * @todo: squarespace-footers
 * @todo: squarespace.main-content
 * @todo: /assets/[...] - asset serving from .server dir
 * @todo: BadFormatters
 * @todo: BadPredicates
 *
 */
var express = require( "express" ),
    request = require( "request" ),
    app = express(),
    path = require( "path" ),
    http = require( "http" ),
    fs = require( "fs" ),
    ncp = require( "ncp" ).ncp,
    jsontemplate = require( "./lib/jsontemplate" ),
    matchroute = require( "./lib/matchroute" ),

    SS_CONTENT = "{squarespace.main-content}",
    SS_HEADERS = "{squarespace-headers}",
    SS_FOOTERS = "{squarespace-footers}",

    URI_COLLECTIONS = "api/commondata/GetCollections",

    headers = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_9_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/37.0.2062.94 Safari/537.36" }
    server = {},

    rQuote = /\'|\"/g,
    rSlash = /\/$/g,
    rSpaces = /^\s+|\s+$/,
    r2Hundo = /^(20\d|1223)$/,
    rBlocks = /\{\@\|apply\s(.*?)\}/g,
    rBlockTags = /^\{\@\|apply\s|\}$/g,
    rRegion = /\.region$/,
    rItemOrList = /\.item$|\.list$/,
    rHeader = /header/,
    rFooter = /footer/,
    rAttrs = /(\w+)=("[^<>"]*"|'[^<>']*'|\w+)/g,
    rQuery = /(\<squarespace:query.*?\>)(.*?)(\<\/squarespace:query\>)/,
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
    if ( formatter_name === "slugify" ) {
        return function () {
            console.log( arguments );
        };
    }
},

jsontopts = {
    more_formatters: more_formatters,
    more_predicates: more_predicates,
    undefined_str: undefined_str
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

        obj[ attr[ 0 ] ] = attr[ 1 ].replace( rQuote, "" );
    }

    return obj;
}

function preprocessTemplate( options ) {
    var templateConf = JSON.parse( readFile( path.join( options.gitroot, "template.conf" ) ) ),
        blockDir = path.join( options.gitroot, "blocks" ),
        collectionDir = path.join( options.gitroot, "collections" ),
        assetDir = path.join( options.gitroot, "assets" ),
        pageDir = path.join( options.gitroot, "pages" ),
        scriptDir = path.join( options.gitroot, "scripts" ),
        styleDir = path.join( options.gitroot, "styles" ),
        collections = fs.readdirSync( collectionDir ),
        allFiles = fs.readdirSync( options.gitroot ),
        regions = [],
        header,
        footer,
        filepath,
        template,
        matched,
        filed,
        block,
        attrs,
        len,
        i,
        j;

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

    for ( var r in options.routes ) {
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
        }

        writeFile( filepath, template );
    }

    // Copy assets + scripts to .server
    ncp( assetDir, path.join( options.webroot, "assets" ) );
    ncp( scriptDir, path.join( options.webroot, "scripts" ) );
}

function requestQuery( options, query, callback ) {
    var data = getAttrObj( query[ 0 ] ),
        qrs = {
            format: "json"
        };

    if ( options.password ) {
        qrs.password = options.password;
    }

    if ( data.tag ) {
        qrs.tag = data.tag;
    }

    if ( data.category ) {
        qrs.category = data.category;
    }

    // limit, featured...

    request({
        url: ( options.siteurl + "/" + data.collection + "/" ),
        json: true,
        headers: headers,
        qs: qrs

    }, function ( error, response, body ) {
        callback( query, body );
    });
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
    var queries = [],
        completed = 0,
        filepath = null,
        template = null,
        matched = null,
        qrs = {
            format: "json"
        };

    // Options
    options.siteurl = options.siteurl.replace( rSlash, "" );

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
    }

    // Preprocess templates
    preprocessTemplate( options );

    // Bind Express routing
    app.use( express.static( options.webroot ) );
    app.set( "port", options.port );
    app.get( "*", function ( req, res ) {
        console.log( "> squarespace-server GET - " + req.params[ 0 ] );

        // Merge query
        for ( i in req.query ) {
            qrs[ i ] = req.query[ i ];
        }

        // Request the page json
        request({
            url: (options.siteurl + req.params[ 0 ]),
            json: true,
            headers: headers,
            qs: qrs

        }, function ( error, response, body ) {
            if ( error ) {
                res.send( "> squarespace-server error" );
            }

            // Do 1xx / 2xx
            if ( r2Hundo.test( response.statusCode ) ) {
                for ( var r in options.routes ) {
                    matched = matchroute.compare( r, req.params[ 0 ] );

                    // Route matched so do work
                    if ( matched.matched ) {
                        // Honor ?format=json, send response as json
                        if ( req.query.format === "json" ) {
                            res.status( 200 ).json( body );

                        // Send the response as html
                        } else {
                            // File Path
                            filepath = path.join( options.webroot, options.routes[ r ] );

                            // Template
                            template = readFile( filepath );

                            // Queries
                            // 0 => Full
                            // 1 => Open
                            // 2 => Template
                            // 3 => Close
                            while ( matched = template.match( rQuery ) ) {
                                template = template.replace( matched[ 0 ], matched[ 2 ] );

                                queries.push( matched );
                            }

                            function handleQueried( query, json ) {
                                var items = [],
                                    data;

                                if ( !queries.length ) {
                                    console.log( "> squarespace-server queries finished" );
                                    return;

                                } else if ( query && json ) {
                                    data = getAttrObj( query[ 0 ] );

                                    if ( data.featured ) {
                                        for ( i = 0, len = json.items.length; i < len; i++ ) {
                                            if ( json.items[ i ].starred ) {
                                                items.push( json.items[ i ] );
                                            }
                                        }

                                        json.items = items;
                                    }

                                    if ( data.limit ) {
                                        json.items.splice( 0, (json.items.length - data.limit) );
                                    }
                                    
                                    // replace query[ 2 ] with rendered jsontemplate
                                    var jsont = jsontemplate.expand( query[ 2 ], json, jsontopts );

                                    template = template.replace( query[ 2 ], jsont );
                                }

                                requestQuery( options, queries.pop(), handleQueried );
                            }

                            //handleQueried();

                            // Render w/jsontemplate
                            template = jsontemplate.expand( template, body, jsontopts );

                            res.status( 200 ).send( template );
                        }
                    }
                }

            // Do 4xx / 5xx
            } else {
                
            }
        });
    });

    http.Server( app ).listen( app.get( "port" ) );

    console.log( "> squarespace-server running on port " + app.get( "port" ) );
};

module.exports = server;