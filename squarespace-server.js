/*!
 *
 * Squarespace node server.
 *
 * @TODOS
 * @todo: squarespace:block-field
 * @todo: squarespace.main-content
 * @todo: squarespace.page-classes
 * @todo: squarespace.page-id
 * @todo: BadFormatters
 * @todo: BadPredicates
 * @todo: 404 pages
 * @todo: styles - less compile
 * @todo: use collection.regionName for template matching
 *
 * @PERFS
 * ...
 *
 * @BREAKS
 * work.list - {.if categoryFilter}{categoryFilter}{.or}All{.end}
 * post-item.block - {.if categories}{.repeated section categories}{@}{.alternates with}{.end}{.end}
 *
 */
var express = require( "express" ),
    request = require( "request" ),
    app = express(),
    path = require( "path" ),
    http = require( "http" ),
    fs = require( "fs" ),
    ncp = require( "ncp" ).ncp,
    slug = require( "slug" ),
    less = require( "less" ),
    jsonTemplate = require( "./lib/jsontemplate" ),
    matchRoute = require( "./lib/matchroute" ),
    functions = require( "./lib/functions" ),

    rQuote = /\'|\"/g,
    rSlash = /^\/|\/$/g,
    rSpaces = /^\s+|\s+$/,
    r2Hundo = /^(20\d|1223)$/,
    rHeader = /header/,
    rFooter = /footer/,
    rAttrs = /(\w+)=("[^<>"]*"|'[^<>']*'|\w+)/g,
    rScripts = /\<script\>(.*?)\<\/script\>/g,
    rIco = /\.ico$/,
    rBlockIncs = /\{\@\|apply\s(.*?)\}/g,
    rBlockTags = /^\{\@\|apply\s|\}$/g,
    rTplFiles = /\.item$|\.list$|\.region$/,
    rRegions = /\.region$/,
    rItemOrList = /\.item$|\.list$/,
    rItem = /\.item$/,
    rList = /\.list$/,
    rLess = /\.less$/,

    // Squarespace content
    rSQSQuery = /(\<squarespace:query.*?\>)(.*?)(\<\/squarespace:query\>)/,
    rSQSNavis = /\<squarespace:navigation(.*?)\/\>/g,
    rSQSBlockFields = /\<squarespace:block-field(.*?)\/\>/g,
    rSQSScripts = /\<squarespace:script(.*?)\/\>/g,
    rSQSClickThroughUrl = /\/s\/(.*?)\.\w+.*?/g,

    SQS_HEADERS = "{squarespace-headers}",
    SQS_FOOTERS = "{squarespace-footers}",
    SQS_MAIN_CONTENT = "{squarespace.main-content}",
    SQS_PAGE_CLASSES = "{squarespace.page-classes}",
    SQS_PAGE_ID = "{squarespace.page-id}",
    SQS_POST_ENTRY = "{squarespace-post-entry}",

    undefined_str = "",
    more_predicates = require( "./lib/predicates" ),
    more_formatters = require( "./lib/formatters" ),

    jsontOptions = {
        more_formatters: more_formatters,
        more_predicates: more_predicates,
        undefined_str: undefined_str
    },

    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_9_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/37.0.2062.94 Safari/537.36",
    },

    directories = {},

    server = {},

    scripts = [];


function getToken() {
    return ("token-" + Date.now() + ("" + Math.floor( (Math.random() * 1000000) + 1 )));
}


function recursiveBlockReplace( template ) {
    var matched,
        block,
        filed;

    while ( matched = template.match( rBlockIncs ) ) {
        for ( i = 0, len = matched.length; i < len; i++ ) {
            block = matched[ i ].replace( rBlockTags, "" );
            filed = functions.readFile( path.join( directories.blocks, block ) );

            template = template.replace( matched[ i ], filed );
        }
    }

    return template;
}


function injectNavigations( options, pageHtml, template ) {
    var attrs,
        block,
        filed,
        open,
        close,
        regex,
        matched,
        match;

    // SQS Navigations
    matched = template.match( rSQSNavis );

    for ( i = 0, len = matched.length; i < len; i++ ) {
        attrs = functions.getAttrObj( matched[ i ] );
        block = (attrs.template + ".block");
        filed = ("" + fs.readFileSync( path.join( directories.blocks, block ) )).split( "\n" );
        open = filed.shift();
        close = filed.pop();
        regex = new RegExp( open + "(.*?)" + close );
        match = pageHtml.match( regex );

        if ( match ) {
            template = template.replace( matched[ i ], match[ 0 ] );
        }
    }

    return template;
}


function appendClickThroughUrls( options, template ) {
    var matched = template.match( rSQSClickThroughUrl ),
        fullUrl;

    if ( !matched ) {
        return template;
    }

    for ( i = 0, len = matched.length; i < len; i++ ) {
        fullUrl = (options.siteurl + matched[ i ]);

        template = template.replace( matched[ i ], fullUrl );
    }

    return template;
}


function replaceSQSTags( template, pageJson ) {
    //template = template.replace( SQS_HEADERS, "" );
    template = template.replace( SQS_FOOTERS, "" );
    template = template.replace( SQS_MAIN_CONTENT, pageJson.mainContent );
    template = template.replace( SQS_PAGE_CLASSES, "" );
    template = template.replace( SQS_PAGE_ID, "" );
    template = template.replace( SQS_POST_ENTRY, "" );

    return template;
}


function getDirectoryTree( options ) {
    return {
        blocks: path.join( options.gitroot, "blocks" ),
        collections: path.join( options.gitroot, "collections" ),
        assets: path.join( options.gitroot, "assets" ),
        pages: path.join( options.gitroot, "pages" ),
        scripts: path.join( options.gitroot, "scripts" ),
        styles: path.join( options.gitroot, "styles" ),
    };
}


function getSmartTemplate( options, reqUri, pageJson ) {
    var template = null,
        uriSegs,
        regcheck,
        tplFiles = fs.readdirSync( options.webroot );

    if ( reqUri === "/" ) {
        uriSegs = ["homepage"];

    } else {
        uriSegs = reqUri.replace( rSlash, "" ).split( "/" );
    }

    regcheck = new RegExp( ("^" + uriSegs[ 0 ]), "i" );

    for ( var i = tplFiles.length; i--; ) {
        if ( !rTplFiles.test( tplFiles[ i ] ) ) {
            continue;
        }

        if ( regcheck.test( tplFiles[ i ] ) ) {
            if ( uriSegs.length > 1 && rList.test( tplFiles[ i ] ) ) {
                template = tplFiles[ i ];

            } else if ( uriSegs.length === 1 && rItem.test( tplFiles[ i ] ) ) {
                template = tplFiles[ i ];

            } else {
                template = tplFiles[ i ];
            }
        }
    }

    if ( !template ) {
        template = (pageJson.collection.regionName + ".region");
    }

    if ( !template ) {
        functions.clog( "Template not matched - " + template );

    } else {
        functions.clog( "TEMPLATE - " + template );

        return template;
    }
}


function preprocessTemplates( options ) {
    var templateConf = JSON.parse( functions.readFile( path.join( options.gitroot, "template.conf" ) ) ),
        collections = fs.readdirSync( directories.collections ),
        allFiles = fs.readdirSync( options.gitroot ),
        tplFiles = fs.readdirSync( options.webroot ),
        reset = path.join( directories.styles, "reset.css" ),
        regions = [],
        header,
        footer,
        filepath,
        template,
        matched,
        filed,
        block,
        attrs,
        cont,
        file,
        link,
        files,
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
            cont = "";
            file = path.join( directories.collections, collections[ i ] );
            link = path.join( options.webroot, collections[ i ] );
            files = [header, file, footer];

            for ( j = 0, len = files.length; j < len; j++ ) {
                cont += functions.readFile( files[ j ] );
            }

            functions.writeFile( link, cont );
        }
    }

    // Region Templates
    for ( i in templateConf.layouts ) {
        files = templateConf.layouts[ i ].regions;
        file = "";
        link = path.join( options.webroot, (templateConf.layouts[ i ].name.toLowerCase() + ".region") );

        for ( j = 0, len = files.length; j < len; j++ ) {
            file += functions.readFile( path.join( options.gitroot, (files[ j ] + ".region") ) );
        }

        functions.writeFile( link, file );
    }

    for ( i = tplFiles.length; i--; ) {
        if ( !rTplFiles.test( tplFiles[ i ] ) ) {
            continue;
        }

        // File Path
        filepath = path.join( options.webroot, tplFiles[ i ] );

        // Template
        template = functions.readFile( filepath );

        // SQS Blocks
        template = recursiveBlockReplace( template );

        // Plain Scripts, will be added back after all parsing
        matched = template.match( rScripts );

        if ( matched ) {
            for ( j = 0, len = matched.length; j < len; j++ ) {
                token = getToken();
                scripts.push({
                    token: token,
                    script: matched[ j ]
                });

                template = template.replace( matched[ j ], token );
            }
        }

        // SQS Scripts
        matched = template.match( rSQSScripts );

        if ( matched ) {
            for ( j = 0, len = matched.length; j < len; j++ ) {
                attrs = functions.getAttrObj( matched[ j ] );
                block = ( "/scripts/" + attrs.src );
                filed = '<script src="' + block + '"></script>';

                template = template.replace( matched[ j ], filed );
            }
        }

        // Stylesheets
        filed = "";

        if ( fs.existsSync( reset ) ) {
            filed += functions.readFile( reset );
        }

        for ( var j = 0, len = templateConf.stylesheets.length; j < len; j++ ) {
            file = "" + fs.readFileSync( path.join( directories.styles, templateConf.stylesheets[ j ] ) );

            if ( rLess.test( templateConf.stylesheets[ j ] ) ) {
                less.render( file, function ( e, css ) {
                    filed += css;
                });

            } else {
                filed += file;
            }
        }

        template = template.replace( SQS_HEADERS, '<link href="/styles/styles.css" rel="stylesheet" />' );

        functions.writeFile( path.join( options.styleroot, "styles.css" ), filed );

        functions.writeFile( filepath, template );
    }

    // Copy assets + scripts to .server
    ncp( directories.assets, path.join( options.webroot, "assets" ) );
    ncp( directories.scripts, path.join( options.webroot, "scripts" ) );
}


function compileTemplate( options, reqUri, qrs, pageJson, pageHtml, callback ) {
    var queries = [],
        filepath = null,
        template = null,
        matched = null;

    // Template?
    options.template = getSmartTemplate( options, reqUri, pageJson );

    // Filepath?
    filepath = path.join( options.webroot, options.template );

    // Html?
    template = functions.readFile( filepath );

    // SQS Tags
    template = replaceSQSTags( template, pageJson );

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
        // Render Navigations from pageHtml
        template = injectNavigations( options, pageHtml, template );

        // Render full clickThroughUrl's
        template = appendClickThroughUrls( options, template );

        // Render w/jsontemplate
        template = jsonTemplate.Template( template, jsontOptions );
        template = template.expand( pageJson );

        // Add token scripts back
        for ( var i = scripts.length; i--; ) {
            template = template.replace( scripts[ i ].token, scripts[ i ].script );
        }

        callback( template );
    }

    function handleQueried( query, data, json ) {
        var items = [],
            tpl;

        if ( query && data && json ) {
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
            requestQuery( options, queries.shift(), qrs, handleQueried );

        } else {
            functions.clog( "Queries finished" );

            handleDone();
        }
    }

    if ( queries.length ) {
        handleQueried();

    } else {
        handleDone();
    }
}


function requestHtml( options, url, qrs, callback ) {
    request({
        url: url,
        headers: headers,
        qs: qrs

    }, function ( error, response, html ) {
        if ( error ) {
            functions.clog( error );
            return;
        }

        callback( html );
    });
}

function requestJson( options, url, qrs, callback ) {
    var qs = {};
        qs.format = "json";

    for ( var i in qrs ) {
        qs[ i ] = qrs[ i ];
    }

    request({
        url: url,
        json: true,
        headers: headers,
        qs: qs

    }, function ( error, response, json ) {
        if ( error ) {
            functions.clog( error );
            return;
        }

        callback( json );
    });
}


function requestJsonAndHtml( options, url, qrs, callback ) {
    var res = {};

    requestJson( options, url, qrs, function ( json ) {
        res.json = json;

        requestHtml( options, url, qrs, function ( html ) {
            res.html = html;

            callback( res );
        })
    });
}


function requestQuery( options, query, qrs, callback ) {
    var data = functions.getAttrObj( query[ 1 ] ),
        url = ( options.siteurl + "/" + data.collection + "/" ),
        slg = ("query-" + data.collection),
        qs = {};
        qs.format = "json";

    for ( var i in qrs ) {
        qs[ i ] = qrs[ i ];
    }

    // Tag?
    if ( data.tag ) {
        qs.tag = data.tag;
        slg += "-" + data.tag;
    }

    // Category?
    if ( data.category ) {
        qs.category = data.category;
        slg += "-" + data.category;
    }

    slg = path.join( options.cacheroot, (slg + ".json") );

    // Cached?
    if ( fs.existsSync( slg ) ) {
        functions.clog( "Loading query from cache" );

        callback( query, data, functions.readJson( slg ) );

    } else {
        request({
            url: url,
            json: true,
            headers: headers,
            qs: qs

        }, function ( error, response, json ) {
            functions.writeJson( slg, json );

            callback( query, data, json );
        });
    }
}


/**
 *
 * siteurl: string
 * password: string
 * port: number,
 * ---
 * gitroot: cwd
 * webroot: .server
 * cacheroot: .server/.cache
 * template: .server/[filename]
 *
 */
server.init = function ( options ) {
    if ( !options ) {
        throw new Error( "You need options, son!" );
    }

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

    if ( !options.cacheroot ) {
        options.cacheroot = path.join( options.webroot, ".cache" );

        if ( !fs.existsSync( options.cacheroot ) ) {
            fs.mkdirSync( options.cacheroot );
        }
    }

    if ( !options.styleroot ) {
        options.styleroot = path.join( options.webroot, "styles" );

        if ( !fs.existsSync( options.styleroot ) ) {
            fs.mkdirSync( options.styleroot );
        }
    }

    // Bind Express routing
    app.use( express.static( options.webroot ) );
    app.set( "port", options.port );
    app.get( "*", function ( appRequest, appResponse ) {
        var cacheHtml,
            cacheJson,
            reqSlug = slug( appRequest.params[ 0 ] ),
            url = (options.siteurl + appRequest.params[ 0 ]),
            qrs = {};

        if ( rIco.test( appRequest.params[ 0 ] ) ) {
            return;
        }

        functions.clog( "GET - " + appRequest.params[ 0 ] );

        // Directories?
        directories = getDirectoryTree( options );

        // Preprocess templates
        // Execute on request for local changes
        preprocessTemplates( options );

        // Homepage?
        if ( reqSlug === "" ) {
            reqSlug = "homepage";
        }

        cacheHtml = path.join( options.cacheroot, (reqSlug + ".html") );
        cacheJson = path.join( options.cacheroot, (reqSlug + ".json") );

        // JSON cache?
        if ( fs.existsSync( cacheJson ) ) {
            cacheJson = functions.readJson( path.join( options.cacheroot, (reqSlug + ".json") ) );

        } else {
            cacheJson = null;
        }

        // HTML cache?
        if ( fs.existsSync( cacheHtml ) ) {
            cacheHtml = functions.readFile( path.join( options.cacheroot, (reqSlug + ".html") ) );

        } else {
            cacheHtml = null;
        }

        // Password?
        if ( options.password ) {
            qrs.password = options.password;
        }

        // Querystring?
        for ( i in appRequest.query ) {
            qrs[ i ] = appRequest.query[ i ];
        }

        // Cache?
        if ( cacheJson && cacheHtml && appRequest.query.format !== "json" ) {
            functions.clog( "Loading request from cache" );

            compileTemplate( options, appRequest.params[ 0 ], qrs, cacheJson, cacheHtml, function ( tpl ) {
                appResponse.status( 200 ).send( tpl );
            });

            return;
        }

        // JSON?
        if ( appRequest.query.format === "json" ) {
            if ( cacheJson ) {
                functions.clog( "Loading json from cache" );

                appResponse.status( 200 ).json( cacheJson );

            } else {
                requestJson( options, url, qrs, function ( json ) {
                    functions.writeJson( path.join( options.cacheroot, (reqSlug + ".json") ), json );

                    appResponse.status( 200 ).json( json );
                });
            }

        // Request page?
        } else {
            requestJsonAndHtml( options, url, qrs, function ( data ) {
                functions.writeJson( path.join( options.cacheroot, (reqSlug + ".json") ), data.json );
                functions.writeFile( path.join( options.cacheroot, (reqSlug + ".html") ), functions.squashHtml( data.html ) );

                compileTemplate( options, appRequest.params[ 0 ], qrs, data.json, functions.squashHtml( data.html ), function ( tpl ) {
                    appResponse.status( 200 ).send( tpl )
                });
            });
        }
    });

    http.Server( app ).listen( app.get( "port" ) );

    functions.clog( "Running on port " + app.get( "port" ) );
};

module.exports = server;