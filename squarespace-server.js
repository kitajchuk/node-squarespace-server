/*!
 *
 * Squarespace node server.
 *
 * @todo: squarespace:query
 * @todo: squarespace:block
 * @todo: squarespace-headers
 * @todo: squarespace-footers
 * @todo: squarespace.main-content
 * @todo: squarespace.page-classes
 * @todo: squarespace.page-id
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
    jsonTemplate = require( "./lib/jsontemplate" ),
    matchRoute = require( "./lib/matchroute" ),

    rQuote = /\'|\"/g,
    rSlash = /\/$/g,
    rSpaces = /^\s+|\s+$/,
    r2Hundo = /^(20\d|1223)$/,
    rHeader = /header/,
    rFooter = /footer/,
    rAttrs = /(\w+)=("[^<>"]*"|'[^<>']*'|\w+)/g,

    rBlockIncs = /\{\@\|apply\s(.*?)\}/g,
    rBlockTags = /^\{\@\|apply\s|\}$/g,
    rRegions = /\.region$/,
    rItemOrList = /\.item$|\.list$/,

    // Squarespace content
    rSQSQuery = /(\<squarespace:query.*?\>)(.*?)(\<\/squarespace:query\>)/,
    rSQSNavis = /\<squarespace:navigation(.*?)\/\>/g,
    rSQSBlockFields = /\<squarespace:block(.*?)\/\>/g,
    rSQSScripts = /\<squarespace:script(.*?)\/\>/g,

    // collectionId=hash
    API_COLLECTION = "api/commondata/GetCollection",
    API_COLLECTIONS = "api/commondata/GetCollections",
    API_SITE_LAYOUT = "api/commondata/GetSiteLayout",

    SQS_HEADERS = "{squarespace-headers}",
    SQS_FOOTERS = "{squarespace-footers}",
    SQS_MAIN_CONTENT = "{squarespace.main-content}",
    SQS_PAGE_CLASSES = "{squarespace.page-classes}",
    SQS_PAGE_ID = "{squarespace.page-id}",
    SQS_POST_ENTRY = "{squarespace-post-entry}",

    sqsFormatters = [
        "item-classes",
        "social-button",
        "comments",
        "comment-link",
        "comment-count",
        "like-button",
        "image-meta",
        "product-price",
        "product-status",

        "json",
        "json-pretty",
        "slugify",
        "url-encode",
        //"html",
        "htmlattr",
        "activate-twitter-links",
        "safe"
    ],

    sqsPredicates = [
        "main-image?",
        "excerpt?",
        "comments?",
        "disqus?",
        "video?",
        "even?",
        "odd?",
        "equal?",
        "collection?",
        "external-link?",
        "folder?"
    ],

    sqsUrlQueries = [
        "format",
        "category",
        "tag",
        "month"
    ],

    jsontFormatters = [
        "html",
        "htmltag",
        "html-attr-value",
        "str",
        "raw",
        "AbsUrl",
        "plain-url"
    ],

    jsontPredicates = [
        "singular",
        "plural",
        "singular?",
        "plural?",
        "Debug?"
    ],

    undefined_str = "",
    
    more_predicates = function ( predicate_name ) {
        var match = false;

        for ( var i = sqsPredicates.length; i--; ) {
            if ( predicate_name === sqsPredicates[ i ] ) {
                match = true;
                break;
            }
        }

        if ( match || (jsontPredicates.indexOf( predicate_name ) === -1) ) {
            return function ( data, ctx ) {
                var split = predicate_name.split( " " ),
                    pred = split[ 0 ],
                    arg = split[ 1 ],
                    ret = false;

                if ( pred === "odd?" ) {
                    ret = !(ctx._LookUpStack( arg ) % 2 == 0);

                } else if ( pred === "even?" ) {
                    ret = (ctx._LookUpStack( arg ) % 2 == 0);

                // .if variable...
                } else {
                    ret = ctx.get( predicate_name );
                }

                return ret;
            };
        }
    },

    more_formatters = function ( formatter_name ) {
        var match = false;

        for ( var i = sqsFormatters.length; i--; ) {
            if ( formatter_name === sqsFormatters[ i ] ) {
                match = true;
                break;
            }
        }

        if ( match || (jsontFormatters.indexOf( formatter_name ) === -1) ) {
            return function () {
                //console.log( formatter_name, arguments );
                return "";
            };
        }
    },

    jsontOptions = {
        more_formatters: more_formatters,
        more_predicates: more_predicates,
        undefined_str: undefined_str
    },

    headers = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_9_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/37.0.2062.94 Safari/537.36" },

    server = {};

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

function preprocessTemplates( options ) {
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
        if ( rRegions.test( allFiles[ i ] ) && rHeader.test( allFiles[ i ] ) ) {
            header = path.join( options.gitroot, allFiles[ i ] );

        } else if ( rRegions.test( allFiles[ i ] ) && rFooter.test( allFiles[ i ] ) ) {
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
        matched = template.match( rBlockIncs );

        for ( i = 0, len = matched.length; i < len; i++ ) {
            block = matched[ i ].replace( rBlockTags, "" );
            filed = readFile( path.join( blockDir, block ) );

            template = template.replace( matched[ i ], filed );
        }

        // Navigations
        matched = template.match( rSQSNavis );

        for ( i = 0, len = matched.length; i < len; i++ ) {
            attrs = getAttrObj( matched[ i ] );
            block = (attrs.template + ".block");
            filed = readFile( path.join( blockDir, block ) );

            template = template.replace( matched[ i ], filed );
        }

        // Scripts
        matched = template.match( rSQSScripts );

        for ( i = 0, len = matched.length; i < len; i++ ) {
            attrs = getAttrObj( matched[ i ] );
            block = ( "/scripts/" + attrs.src );
            filed = '<script src="' + block + '"></script>';

            template = template.replace( matched[ i ], filed );
        }

        // Squarespace Tags
        template = template.replace( SQS_HEADERS, "" );
        template = template.replace( SQS_FOOTERS, "" );
        template = template.replace( SQS_MAIN_CONTENT, "" );
        template = template.replace( SQS_PAGE_CLASSES, "" );
        template = template.replace( SQS_PAGE_ID, "" );
        template = template.replace( SQS_POST_ENTRY, "" );

        writeFile( filepath, template );
    }

    // Copy assets + scripts to .server
    ncp( assetDir, path.join( options.webroot, "assets" ) );
    ncp( scriptDir, path.join( options.webroot, "scripts" ) );
}

function requestQuery( options, query, callback ) {
    var data = getAttrObj( query[ 1 ] ),
        qrs = {
            format: "json"
        };

    console.log( "query data", data );

    if ( options.password ) {
        qrs.password = options.password;
    }

    if ( data.tag ) {
        qrs.tag = data.tag;
    }

    if ( data.category ) {
        qrs.category = data.category;
    }

    request({
        url: ( options.siteurl + "/" + data.collection + "/" ),
        json: true,
        headers: headers,
        qs: qrs

    }, function ( error, response, body ) {
        callback( query, data, body );
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
    request({
        url: "https://instrument.squarespace.com/api/auth/Login",
        headers: headers,
        method: "POST",
        form: {
            email: "kitajchuk@gmail.com",
            password: "sunboxnine99"
        }

    }, function ( error, response, body ) {
        console.log( arguments );
    });
    return;
    
    // Options
    options.siteurl = options.siteurl.replace( rSlash, "" );

    if ( !options.port ) {
        options.port = 5050;
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
    preprocessTemplates( options );

    // Bind Express routing
    app.use( express.static( options.webroot ) );
    app.set( "port", options.port );
    app.get( "*", function ( req, res ) {
        var queries = [],
            filepath = null,
            template = null,
            matched = null,
            qrs = {
                format: "json"
            };

        console.log( "> squarespace-server GET - " + req.params[ 0 ] );

        // Password
        if ( options.password ) {
            qrs.password = options.password;
        }

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
                    matched = matchRoute.compare( r, req.params[ 0 ] );

                    // Route matched so do work
                    if ( matched.matched ) {
                        // Honor ?format=json, send response as json
                        if ( req.query.format === "json" ) {
                            res.status( 200 ).json( body );

                        // Send the response as html
                        } else {
                            // File Path
                            filepath = path.join( options.webroot, options.routes[ r ] );

                            console.log( "> squarespace-server TEMPLATE - " + options.routes[ r ] );

                            // Template
                            template = readFile( filepath );

                            // Queries
                            // 0 => Full
                            // 1 => Open
                            // 2 => Template
                            // 3 => Close
                            while ( matched = template.match( rSQSQuery ) ) {
                                template = template.replace( matched[ 0 ], matched[ 2 ] );

                                queries.push( matched );
                            }

                            function handleDone() {
                                // Render w/jsontemplate
                                template = jsonTemplate.Template( template, jsontOptions );
                                template = template.expand( body );

                                res.status( 200 ).send( template );
                            }

                            function handleQueried( query, data, json ) {
                                var items = [],
                                    tpl;

                                if ( query && data && json ) {
                                    console.log( "query json", json.items.length );

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

                                    tpl = jsonTemplate.Template( query[ 2 ], jsontOptions );
                                    tpl = tpl.expand( json );

                                    template = template.replace( query[ 2 ], tpl );
                                }

                                if ( queries.length ) {
                                    requestQuery( options, queries.shift(), handleQueried );

                                } else {
                                    console.log( "> squarespace-server queries finished" );

                                    handleDone();
                                }
                            }

                            if ( queries.length ) {
                                handleQueried();

                            } else {
                                handleDone();
                            }
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