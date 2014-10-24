/*!
 *
 * Squarespace node server.
 *
 * - Cache conventions
 *      - block-*.html
 *      - query-*.json
 *      - page-*.json
 *      - page-*.html
 *      - api-*.json
 *
 */
var _ = require( "underscore" ),
    bodyParser = require( "body-parser" ),
    cookieParser = require( "cookie" ),
    express = require( "express" ),
    request = require( "request" ),
    path = require( "path" ),
    http = require( "http" ),
    fs = require( "fs" ),
    fse = require( "fs-extra" ),
    slug = require( "slug" ),
    less = require( "less" ),
    uglifycss = require( "uglifycss" ),
    jsonTemplate = require( "./lib/jsontemplate" ),
    functions = require( "./lib/functions" ),
    blocktypes = require( "./lib/blocktypes" ),
    blockrenders = require( "./lib/blockrenders" ),

    rProtocol = /^https:|^http:/g,
    rQuote = /\'|\"/g,
    rSlash = /^\/|\/$/g,
    rSpaces = /^\s+|\s+$/,
    r2Hundo = /^(20\d|1223)$/,
    rHeader = /header/,
    rFooter = /footer/,
    rAttrs = /(\w+)=("[^<>"]*"|'[^<>']*'|\w+)/g,
    rScripts = /\<script.*?\>(.*?)\<\/script\>/g,
    rIco = /\.ico$/,
    rBlockIncs = /\{\@\|apply\s(.*?)\}/g,
    rBlockTags = /^\{\@\|apply\s|\}$/g,
    rTplFiles = /\.item$|\.list$|\.region$/,
    rItemOrList = /\.item$|\.list$/,
    rRegions = /\.region$/,
    rItem = /\.item$/,
    rList = /\.list$/,
    rLess = /\.less$/,
    rApi = /^\/api/,
    rDotIf = /\{\.if/g,
    rJsonT = /^\{.*?\}$/,

    // Squarespace content
    rSQSQuery = /(\<squarespace:query.*?\>)(.*?)(\<\/squarespace:query\>)/,
    rSQSNavis = /\<squarespace:navigation(.*?)\/\>/g,
    rSQSBlockFields = /\<squarespace:block-field(.*?)\/\>/g,
    rSQSScripts = /\<squarespace:script(.*?)\/\>/g,
    rSQSClickThroughUrl = /\/s\/(.*?)\.\w+.*?/g,
    rSQSFootersFull = /\<script type="text\/javascript" data-sqs-type="imageloader"\>(.*)\<\/script\>/,
    rSQSHeadersFull = null,
    rSiteCssReplace = /\<link rel="stylesheet" type="text\/css" href="(.*?)site\.css\?(.*?)\>/g,
    rHref = /href="(.*?)"/,

    SQS_HEADERS = "{squarespace-headers}",
    SQS_FOOTERS = "{squarespace-footers}",
    SQS_MAIN_CONTENT = "{squarespace.main-content}",
    SQS_PAGE_CLASSES = "{squarespace.page-classes}",
    SQS_PAGE_ID = "{squarespace.page-id}",
    SQS_POST_ENTRY = "{squarespace-post-entry}",

    API_GET_SITELAYOUT = "/api/commondata/GetSiteLayout/",
    API_GET_COLLECTION = "/api/commondata/GetCollection/", //?collectionId
    API_GET_COLLECTIONS = "/api/commondata/GetCollections/",
    API_GET_TEMPLATE = "/api/template/GetTemplate/", // ?templateId
    API_GET_BLOCKFIELDS = "/api/block-fields/",
    API_GET_WIDGETRENDERING = "/api/widget/GetWidgetRendering/",
    API_AUTH_LOGIN = "/api/auth/Login/",

    undefined_str = "",
    more_predicates = require( "./lib/predicates" ),
    more_formatters = require( "./lib/formatters" ),

    jsontOptions = {
        more_formatters: more_formatters,
        more_predicates: more_predicates,
        undefined_str: undefined_str
    },

    sqsHeaders = [],
    sqsFooters = [],

    // Squarespace login required
    sqsUserData = null,

    // 24 hours
    sqsTimeOfLogin = null,
    sqsTimeLoggedIn = 86400000,

    // Squarespace uses /homepage
    homepage = "homepage",

    directories = {},

    config = null,

    scripts = [],

    siteCss = null,

    header = null,
    footer = null,

    templates = {},

    app = express();


/**
 *
 * @method renderJsonTemplate
 * @param {string} render The template string
 * @param {object} data The data context
 * @returns {string}
 * @private
 *
 */
function renderJsonTemplate( render, data ) {
    // TEMPORARY SOLUTION!
    // Formalize .if to .section and avoid json-template blowing up
    // This fixes issues with nested .repeated sections within a .if
    var match;

    while ( match = render.match( /\{\.if\s(.*?)\}/ ) ) {
        render = render.replace( match[ 0 ], "{.section " + match[ 1 ] + "}" );
        render = render.replace( new RegExp( "{.repeated section " + match[ 1 ] + "}" ), "{.repeated section @}" );
    }

    render = jsonTemplate.Template( render, jsontOptions );
    render = render.expand( data );

    return render;
}


/**
 *
 * @method loginPortal
 * @param {function} callback Fired when login and headers are set
 * @private
 *
 */
function loginPortal( callback ) {
    // POST to login
    request({
        method: "POST",
        url: (config.server.siteurl + API_AUTH_LOGIN),
        json: true,
        headers: getHeaders(),
        form: sqsUserData

    }, function ( error, response, json ) {
        if ( error ) {
            functions.log( error );
            return;
        }

        // Request to TokenLogin
        request({
            url: json.targetWebsite.loginUrl,
            json: true,
            headers: getHeaders(),
            qs: sqsUserData

        }, function ( error, response, json ) {
            if ( error ) {
                functions.log( error );
                return;
            }

            // Get the response cookie we need
            var cookie = response.headers[ "set-cookie" ].join( ";" );

            // Set request headers we will use
            headers = getHeaders({
                "Cookie": cookie
            });

            callback( headers );
        });
    });
}


/**
 *
 * @method lookupCollection
 * @param {string} id The collection ID
 * @returns {object}
 * @private
 *
 */
function lookupCollection( id ) {
    var collection = null;

    for ( var i in config.server.siteData.collections.collections ) {
        if ( i === id ) {
            collection = config.server.siteData.collections.collections[ id ];
            break;
        }
    }

    return collection;
}


/**
 *
 * @method getHeaders
 * @param {object} headers Merge object with required headers
 * @returns {object}
 * @private
 *
 */
function getHeaders( headers ) {
    var ret = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_9_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/37.0.2062.94 Safari/537.36"
    };

    if ( headers ) {
        ret = _.extend( ret, headers );
    }

    return ret;
}


/**
 *
 * @method requestHtml
 * @param {string} url Request url
 * @param {object} qrs Querystring mapping
 * @param {function} callback Fired when done
 * @private
 *
 */
function requestHtml( url, qrs, callback ) {
    request({
        url: url,
        headers: getHeaders(),
        qs: qrs

    }, function ( error, response, html ) {
        if ( error ) {
            functions.log( error );
            return;
        }

        callback( html );
    });
}


/**
 *
 * @method requestJson
 * @param {string} url Request url
 * @param {object} qrs Querystring mapping
 * @param {function} callback Fired when done
 * @private
 *
 */
function requestJson( url, qrs, callback ) {
    var qs = {};
        qs.format = "json";

    for ( var i in qrs ) {
        qs[ i ] = qrs[ i ];
    }

    request({
        url: url,
        json: true,
        headers: getHeaders(),
        qs: qs

    }, function ( error, response, json ) {
        if ( error ) {
            functions.log( error );
            return;
        }

        callback( json );
    });
}


/**
 *
 * @method requestJsonAndHtml
 * @param {string} url Request url
 * @param {object} qrs Querystring mapping
 * @param {function} callback Fired when done
 * @private
 *
 */
function requestJsonAndHtml( url, qrs, callback ) {
    var res = {};

    requestJson( url, qrs, function ( json ) {
        res.json = json;

        requestHtml( url, qrs, function ( html ) {
            res.html = html;

            callback( res );
        })
    });
}


/**
 *
 * @method requestQuery
 * @param {object} query Regex matched object
 * @param {object} qrs Querystring mapping
 * @param {object} pageJson The page JSON
 * @param {function} callback Fired when done
 * @private
 *
 */
function requestQuery( query, qrs, pageJson, callback ) {
    var data = functions.getAttrObj( query[ 1 ] ),
        match = data.collection.match( rJsonT ),
        qs = {},
        url,
        slg;

    if ( match ) {
        match = match[ 0 ];

        data.collection = renderJsonTemplate( match, pageJson );
    }

    url = ( config.server.siteurl + "/" + data.collection + "/" );
    slg = ("query-" + data.collection);

    qs.format = "json";

    for ( var i in qrs ) {
        qs[ i ] = qrs[ i ];

        // Skip password in unique cache
        if ( i !== "format" && i !== "password" && i !== "nocache" ) {
            slg += ("-" + i + "--" + qrs[ i ]);
        }
    }

    // Tag?
    if ( data.tag ) {
        qs.tag = data.tag;
        slg += "-tag--" + data.tag;
    }

    // Category?
    if ( data.category ) {
        qs.category = data.category;
        slg += "-category--" + data.category;
    }

    slg = path.join( config.server.cacheroot, (slg + ".json") );

    // Cached?
    if ( fs.existsSync( slg ) && qrs.nocache === undefined ) {
        functions.log( "Loading query from cache" );

        callback( query, data, functions.readJson( slg ) );

    } else {
        if ( qrs.nocache !== undefined ) {
            functions.log( "Clearing query cache: ", data.collection );
        }

        request({
            url: url,
            json: true,
            headers: getHeaders(),
            qs: qs

        }, function ( error, response, json ) {
            if ( error ) {
                functions.log( error );
                return;
            }

            functions.writeJson( slg, json );

            callback( query, data, json );
        });
    }
}


/**
 *
 * config.server = {
 *      siteurl,
 *      webroot,
 *      cacheroot,
 *      port,
 *      password
 *      secureauth,
 *      siteData
 * };
 *
 * @method setServerConfig
 * @private
 *
 */
function setServerConfig() {
    // @global - config
    config.server.siteurl = config.server.siteurl.replace( rSlash, "" );
    config.server.port = (config.server.port || 5050);
    config.server.webroot = process.cwd();
    config.server.protocol = config.server.siteurl.match( rProtocol )[ 0 ];
    config.server.siteData = {};

    if ( !config.server.cacheroot ) {
        config.server.cacheroot = path.join( config.server.webroot, ".sqs-cache" );

        if ( !fs.existsSync( config.server.cacheroot ) ) {
            fs.mkdirSync( config.server.cacheroot );
        }
    }
}


/**
 *
 * @method setDirectories
 * @returns {object}
 * @private
 *
 */
function setDirectories() {
    // @global - directories
    directories = {
        blocks: path.join( config.server.webroot, "blocks" ),
        collections: path.join( config.server.webroot, "collections" ),
        assets: path.join( config.server.webroot, "assets" ),
        pages: path.join( config.server.webroot, "pages" ),
        scripts: path.join( config.server.webroot, "scripts" ),
        styles: path.join( config.server.webroot, "styles" )
    };
}


/**
 *
 * @method getToken
 * @returns {string}
 * @private
 *
 */
function getToken() {
    return ("token-" + Date.now() + ("" + Math.floor( (Math.random() * 1000000) + 1 )));
}


/**
 *
 * @method setSQSHeadersFooters
 * @param {function} callback Handle composition done
 * @private
 *
 */
function setSQSHeadersFooters( callback ) {
    sqsHeaders = [];
    sqsFooters = [];

    return callback;
}


/**
 *
 * @method setHeaderFooter
 * @param {function} callback Handle composition done
 * @private
 *
 */
function setHeaderFooter( callback ) {
    var files = fs.readdirSync( config.server.webroot );

    for ( i = files.length; i--; ) {
        if ( rRegions.test( files[ i ] ) && rHeader.test( files[ i ] ) ) {
            header = path.join( config.server.webroot, files[ i ] );

        } else if ( rRegions.test( files[ i ] ) && rFooter.test( files[ i ] ) ) {
            footer = path.join( config.server.webroot, files[ i ] );
        }
    }

    return callback;
}


/**
 *
 * @method compileCollections
 * @param {function} callback Handle composition done
 * @private
 *
 */
function compileCollections( callback ) {
    var collections = fs.readdirSync( directories.collections ),
        content = null,
        file = null,
        files = null;

    for ( var i = collections.length; i--; ) {
        if ( rItemOrList.test( collections[ i ] ) ) {
            content = "";
            file = path.join( directories.collections, collections[ i ] );
            files = [header, file, footer];

            for ( var j = 0, len = files.length; j < len; j++ ) {
                content += functions.readFile( files[ j ] );
            }

            templates[ collections[ i ] ] = content;
        }
    }

    return callback;
}


/**
 *
 * @method compileRegions
 * @param {function} callback Handle composition done
 * @private
 *
 */
function compileRegions( callback ) {
    var files = null,
        file = null,
        link = null;

    for ( var i in config.layouts ) {
        files = config.layouts[ i ].regions;
        file = "";
        //link = (config.layouts[ i ].name.toLowerCase() + ".region");
        link = (i + ".region");

        for ( j = 0, len = files.length; j < len; j++ ) {
            file += functions.readFile( path.join( config.server.webroot, (files[ j ] + ".region") ) );
        }

        templates[ link ] = file;
    }

    return callback;
}


/**
 *
 * @method replaceBlocks
 * @param {function} callback Handle composition done
 * @private
 *
 */
function replaceBlocks( callback ) {
    var matched,
        block,
        filed;

    for ( var i in templates ) {
        if ( !rTplFiles.test( i ) ) {
            continue;
        }

        while ( matched = templates[ i ].match( rBlockIncs ) ) {
            for ( var j = 0, len = matched.length; j < len; j++ ) {
                block = matched[ j ].replace( rBlockTags, "" );
                filed = functions.readFile( path.join( directories.blocks, block ) );

                templates[ i ] = templates[ i ].replace( matched[ j ], filed );
            }
        }
    }

    return callback;
}


/**
 *
 * @method replaceScripts
 * @param {function} callback Handle composition done
 * @private
 *
 */
function replaceScripts( callback ) {
    var matched,
        token;

    for ( var i in templates ) {
        if ( !rTplFiles.test( i ) ) {
            continue;
        }

        matched = templates[ i ].match( rScripts );

        if ( matched ) {
            for ( var j = 0, len = matched.length; j < len; j++ ) {
                token = getToken();
                scripts.push({
                    token: token,
                    script: matched[ j ]
                });

                templates[ i ] = templates[ i ].replace( matched[ j ], token );
            }
        }
    }

    return callback;
}


/**
 *
 * @method replaceSQSScripts
 * @param {function} callback Handle composition done
 * @private
 *
 */
function replaceSQSScripts( callback ) {
    var matched,
        attrs,
        block,
        filed;

    for ( var i in templates ) {
        if ( !rTplFiles.test( i ) ) {
            continue;
        }

        matched = templates[ i ].match( rSQSScripts );

        if ( matched ) {
            for ( var j = 0, len = matched.length; j < len; j++ ) {
                attrs = functions.getAttrObj( matched[ j ] );
                block = ( "/scripts/" + attrs.src );
                filed = '<script src="' + block + '"></script>';

                templates[ i ] = templates[ i ].replace( matched[ j ], filed );
            }
        }
    }

    return callback;
}


/**
 *
 * @method compileStylesheets
 * @param {function} callback Handle composition done
 * @private
 *
 */
function compileStylesheets( callback ) {
    var reset = path.join( directories.styles, "reset.css" ),
        styles = "",
        fpath,
        file;

    if ( fs.existsSync( reset ) ) {
        styles += functions.readFile( reset );
    }

    for ( var i = 0, len = config.stylesheets.length; i < len; i++ ) {
        fpath = path.join( directories.styles, config.stylesheets[ i ] );

        if ( !fs.existsSync( fpath ) ) {
            continue;
        }

        file = "" + fs.readFileSync( fpath );

        if ( rLess.test( config.stylesheets[ i ] ) ) {
            less.render( file, function ( e, css ) {
                styles += css;
            });

        } else {
            styles += file;
        }
    }

    siteCss = uglifycss.processString( styles );

    return callback;
}


/**
 *
 * @method getTemplate
 * @param {string} reqUri URI seg zero
 * @param {object} pageJson JSON data for page
 * @private
 *
 */
function getTemplate( reqUri, pageJson ) {
    var template = null,
        uriSegs = null,
        regcheck = null;

    if ( reqUri === "/" ) {
        uriSegs = [homepage];

    } else {
        uriSegs = reqUri.replace( rSlash, "" ).split( "/" );
    }

    // removed .*?
    regcheck = new RegExp( (uriSegs[ 0 ] + "\\."), "i" );

    for ( var tpl in templates ) {
        if ( !rTplFiles.test( tpl ) ) {
            continue;
        }

        // Homepage => This is a special case
        if ( pageJson.collection.homepage ) {
            // It is of type page, break and use region below
            if ( pageJson.collection.typeName === "page" ) {
                break;

            // It is a collection and a .list of its type is located
            } else if ( fs.existsSync( path.join( directories.collections, (pageJson.collection.typeName + ".list") ) ) ) {
                template = (pageJson.collection.typeName + ".list");
                break;
            }

        } else {
            // 0 => Multiple URIs some/fresh/page
            // 1 => Regular Expression tests out
            // 2 => Filename tests out as a .item file
            if ( uriSegs.length > 1 && regcheck.test( tpl ) && rItem.test( tpl ) ) {
                template = tpl;
                break;
            }

            // 0 => A Single URI page
            // 1 => Regular Expression tests out
            // 2 => Filename tests out as a .list file
            if ( uriSegs.length === 1 && regcheck.test( tpl ) && rList.test( tpl ) ) {
                template = tpl;
                break;
            }

            // 1 => Regular Expression tests out
            // 2 => Filename tests out as a .region file
            if ( regcheck.test( tpl ) && rRegions.test( tpl ) ) {
                template = tpl;
                break;
            }
        }
    }

    // 0 => Template not matched above, try page JSON
    if ( !template ) {
        template = (pageJson.collection.regionName + ".region");
    }

    // 0 => Template still didn't match up, fail...
    if ( !template ) {
        functions.log( "Template not matched - " + template );

    } else {
        functions.log( "TEMPLATE - " + template );

        return template;
    }
}


/**
 *
 * @method replaceSQSTags
 * @param {string} rendered The template rendering
 * @param {object} pageJson JSON data for page
 * @returns {string}
 * @private
 *
 */
function replaceSQSTags( rendered, pageJson ) {
    var pageType = pageJson.item ? "item" : "collection",
        pageId = pageJson.item ? pageJson.item.id : pageJson.collection.id;

    rendered = rendered.replace( SQS_MAIN_CONTENT, pageJson.mainContent );
    rendered = rendered.replace( SQS_PAGE_CLASSES, "" );
    rendered = rendered.replace( new RegExp( SQS_PAGE_ID, "g" ), (pageType + "-" + pageId) );
    rendered = rendered.replace( SQS_POST_ENTRY, "" );

    return rendered;
}


/**
 *
 * @method replaceNavigations
 * @param {string} rendered The template rendering
 * @param {string} pageJson The JSON for the page
 * @returns {string}
 * @private
 *
 */
function replaceNavigations( rendered, pageJson ) {
    var context = {
            active: false,
            folderActive: false,
            website: pageJson.website,
            items: []
        },
        block,
        items,
        attrs,
        matched,
        template,
        i,
        iLen,
        j,
        k,
        kLen;

    // SQS Navigations
    matched = rendered.match( rSQSNavis );

    if ( matched ) {
        for ( i = 0, iLen = matched.length; i < iLen; i++ ) {
            attrs = functions.getAttrObj( matched[ i ] );
            block = (attrs.template + ".block");
            template = functions.readFile( path.join( directories.blocks, block ) );

            for ( j = config.server.siteData.siteLayout.layout.length; j--; ) {
                if ( config.server.siteData.siteLayout.layout[ j ].identifier === attrs.navigationId ) {
                    items = [];

                    for ( var k = 0, kLen = config.server.siteData.siteLayout.layout[ j ].links.length; k < kLen; k++ ) {
                        if ( config.server.siteData.siteLayout.layout[ j ].links[ k ].collectionId ) {
                            items.push({
                                active: false,
                                folderActive: false,
                                collection: lookupCollection( config.server.siteData.siteLayout.layout[ j ].links[ k ].collectionId )
                            });

                        } else {
                            items.push( config.server.siteData.siteLayout.layout[ j ].links[ k ] );
                        }
                    }

                    context.items = items;
                }
            }

            template = renderJsonTemplate( template, context );

            rendered = rendered.replace( matched[ i ], template );
        }
    }

    return rendered;
}


/**
 *
 * @method renderBlockField
 * @param {object} json Block data
 * @param {string} type Block type
 * @private
 *
 */
function renderBlockField( json, type ) {
    var html = "";

    type = type.toLowerCase();

    html += '<div class="sqs-block ' + type + '-block sqs-block-' + type + '" data-block-type="' + json.type + '" id="block-' + json.id + '" data-block-json="' + JSON.stringify( json ).replace( /"/g, "&quot;" ) + '">';
    html += '<div class="sqs-block-content">';
    html += blockrenders( json, type );
    html += '</div>';
    html += '</div>';

    return html;
}


/**
 *
 * @method replaceBlockFields
 * @param {string} rendered The template rendering
 * @param {function} callback The callback when done rendering
 * @private
 *
 */
function replaceBlockFields( rendered, callback ) {
    var matched;

    // SQS Block Fields
    matched = rendered.match( rSQSBlockFields );

    if ( matched ) {
        loginPortal(function ( headers ) {
            function loopBlocks( block, attrs, json ) {
                var rows,
                    rLen,
                    html;

                if ( json ) {
                    rows = json.data.layout.rows;
                    rLen = rows.length;
                    html = '<div id="' + attrs.id + '" class="sqs-layout sqs-grid-' + json.data.layout.columns + ' columns-' + json.data.layout.columns + (attrs["locked-layout"] ? ' sqs-locked-layout' : '') + '" data-type="block-field" data-updated-on="' + json.data.updatedOn + '">';

                    // rows > columns > blocks
                    for ( var i = 0; i < rLen; i++ ) {
                        var columns = rows[ i ].columns,
                            cLen = columns.length;

                        html += '<div class="row sqs-row">';

                        for ( var j = 0; j < cLen; j++ ) {
                            var blocks = columns[ j ].blocks,
                                bLen = blocks.length;

                            html += '<div class="col sqs-col-' + (12 / attrs.columns) + ' span-' + columns[ j ].span + '">';

                            for ( var k = 0; k < bLen; k++ ) {
                                for ( var b in blocktypes ) {
                                    if ( blocks[ k ].type === blocktypes[ b ] && blocks[ k ].value.html !== "" ) {
                                        html += renderBlockField( blocks[ k ], b );
                                    }
                                }
                            }

                            html += '</div>';
                        }

                        html += '</div>';
                    }

                    html += '</div>';

                    rendered = rendered.replace( block, html );
                }

                if ( !matched.length ) {
                    callback( rendered );

                } else {
                    getBlock();
                }
            }

            function getBlock() {
                var block = matched.shift(),
                    attrs = functions.getAttrObj( block ),
                    crumb = cookieParser.parse( headers.Cookie ).crumb,
                    blockPath = path.join( config.server.cacheroot, ("block-" + attrs.id + ".json") ),
                    blockJson;

                if ( fs.existsSync( blockPath ) ) {
                    blockJson = functions.readJson( blockPath );

                    loopBlocks( block, attrs, blockJson );

                    functions.log( "BLOCK - Cached " + attrs.id );

                } else {
                    request({
                        url: (config.server.siteurl + API_GET_BLOCKFIELDS + attrs.id),
                        json: true,
                        headers: headers,
                        qs: sqsUserData

                    }, function ( error, response, json ) {
                        // cache block json
                        // check first, block could be "undefined"
                        if ( json ) {
                            functions.writeJson( blockPath, json );
                        }

                        loopBlocks( block, attrs, json );
                    });
                }
            }

            getBlock();
        });

    } else {
        callback( rendered );
    }
}


/**
 *
 * @method replaceClickThroughUrls
 * @param {string} rendered The template rendering
 * @returns {string}
 * @private
 *
 */
function replaceClickThroughUrls( rendered ) {
    var matched = rendered.match( rSQSClickThroughUrl ),
        fullUrl;

    if ( matched ) {
        for ( i = 0, len = matched.length; i < len; i++ ) {
            fullUrl = (config.server.siteurl + matched[ i ]);

            rendered = rendered.replace( matched[ i ], fullUrl );
        }
    }

    return rendered;
}


/**
 *
 * @method setHeaderFooterTokens
 * @param {object} pageJson JSON data for page
 * @param {string} pageHtml HTML for page
 * @returns {string}
 * @private
 *
 */
function setHeaderFooterTokens( pageJson, pageHtml ) {
    var tokenHeadersFull = getToken(),
        tokenFootersFull = getToken(),
        sHeadersFull = pageHtml.match( rSQSHeadersFull ),
        sFootersFull = pageHtml.match( rSQSFootersFull ),
        siteStyleTag = null,
        sSiteCssMatch;

    // Headers?
    if ( sHeadersFull ) {
        sHeadersFull = sHeadersFull[ 0 ];
        //sSiteCssMatch = sHeadersFull[ 0 ].match( rSiteCssReplace );
        siteStyleTag = '<!-- ' + config.name + ' Local Styles --><style type="text/css">' + siteCss + '</style>';
        //sHeadersFull = sHeadersFull[ 0 ].replace( sSiteCssMatch[ sSiteCssMatch.length - 1 ], "<!-- Site.css Removed -->" );
        sHeadersFull += siteStyleTag;
        sqsHeaders.push( tokenHeadersFull );
        scripts.push({
            token: tokenHeadersFull,
            script: sHeadersFull
        });
    }

    // Footers?
    if ( sFootersFull ) {
        sqsFooters.push( tokenFootersFull );
        scripts.push({
            token: tokenFootersFull,
            script: sFootersFull[ 0 ]
        });
    }
}


/**
 *
 * @method renderTemplate
 * @param {string} reqUri URI seg zero
 * @param {object} qrs Querystring mapping
 * @param {object} pageJson JSON data for page
 * @param {string} pageHtml HTML for page
 * @param {function} clalback Fired when done
 * @private
 *
 */
function renderTemplate( reqUri, qrs, pageJson, pageHtml, callback ) {
    var queries = [],
        template = null,
        rendered = null,
        matched = null;

    // Template?
    template = getTemplate( reqUri, pageJson );

    // Html?
    rendered = templates[ template ];

    // SQS Tags?
    rendered = replaceSQSTags( rendered, pageJson );

    // Queries
    // 0 => Full
    // 1 => Open
    // 2 => Template
    // 3 => Close
    while ( matched = rendered.match( rSQSQuery ) ) {
        rendered = rendered.replace( matched[ 0 ], matched[ 2 ] );

        queries.push( matched );
    }

    function handleDone() {
        // Create {squarespace-headers} / {squarespace-footers}
        setHeaderFooterTokens( pageJson, pageHtml );

        // Render {squarespace-headers} to the best of our ability
        rendered = rendered.replace( SQS_HEADERS, sqsHeaders.join( "" ) );

        // Render {squarespace-footers} to the best of our ability
        rendered = rendered.replace( SQS_FOOTERS, sqsFooters.join( "" ) );

        // Render Navigations from pageHtml
        rendered = replaceNavigations( rendered, pageJson );

        // Render full clickThroughUrl's
        rendered = replaceClickThroughUrls( rendered );

        // Render w/jsontemplate
        rendered = renderJsonTemplate( rendered, pageJson );

        // Add token scripts back into the template
        for ( var i = scripts.length; i--; ) {
            rendered = rendered.replace( scripts[ i ].token, scripts[ i ].script );
        }

        // Render Block Fields
        replaceBlockFields( rendered, function ( finalRender ) {
            callback( finalRender );
        });
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

            tpl = renderJsonTemplate( query[ 2 ], json );

            rendered = rendered.replace( query[ 2 ], tpl );
        }

        if ( queries.length ) {
            requestQuery( queries.shift(), qrs, pageJson, handleQueried );

        } else {
            handleDone();
        }
    }

    if ( queries.length ) {
        handleQueried();

    } else {
        handleDone();
    }
}


/**
 *
 * @method compositionDone
 * @param {function} callback Handle composition done
 * @private
 *
 */
function compositionDone( callback ) {
    callback();
}


/**
 *
 * @method onCompositionDone
 * @param {object} appRequest The express request
 * @param {object} appResponse The express response
 * @private
 *
 */
function onCompositionDone( appRequest, appResponse ) {
    var cacheHtml = null,
        cacheJson = null,
        cacheName = null,
        slugged = slug( appRequest.params[ 0 ] ),
        reqSlug = ( slugged === "" ) ? homepage : slugged,
        url = (config.server.siteurl + appRequest.params[ 0 ]),
        qrs = {};

    cacheName = ("page-" + reqSlug);

    // Password?
    if ( config.server.password ) {
        qrs.password = config.server.password;
    }

    // Querystring?
    for ( i in appRequest.query ) {
        qrs[ i ] = appRequest.query[ i ];

        // Unique cache file name including queries
        if ( i !== "format" && i !== "password" && i !== "nocache" ) {
            cacheName += ("-" + i + "--" + qrs[ i ]);
        }
    }

    cacheHtml = path.join( config.server.cacheroot, (cacheName + ".html") );
    cacheJson = path.join( config.server.cacheroot, (cacheName + ".json") );

    // JSON cache?
    if ( fs.existsSync( cacheJson ) ) {
        cacheJson = functions.readJson( path.join( config.server.cacheroot, (cacheName + ".json") ) );

    } else {
        cacheJson = null;
    }

    // HTML cache?
    if ( fs.existsSync( cacheHtml ) ) {
        cacheHtml = functions.readFile( path.join( config.server.cacheroot, (cacheName + ".html") ) );

    } else {
        cacheHtml = null;
    }

    // Nocache?
    if (  appRequest.query.nocache !== undefined ) {
        cacheJson = null;
        cacheHtml = null;

        functions.log( "Clearing request cache" );
    }

    // Cache?
    if ( cacheJson && cacheHtml && appRequest.query.format !== "json" ) {
        functions.log( "Loading request from cache" );

        renderTemplate( appRequest.params[ 0 ], qrs, cacheJson, cacheHtml, function ( tpl ) {
            appResponse.status( 200 ).send( tpl );
        });

        return;
    }

    // JSON?
    if ( appRequest.query.format === "json" ) {
        if ( cacheJson ) {
            functions.log( "Loading json from cache" );

            appResponse.status( 200 ).json( cacheJson );

        } else {
            requestJson( url, qrs, function ( json ) {
                functions.writeJson( path.join( config.server.cacheroot, (cacheName + ".json") ), json );

                appResponse.status( 200 ).json( json );
            });
        }

    // Request page?
    } else {
        requestJsonAndHtml( url, qrs, function ( data ) {
            functions.writeJson( path.join( config.server.cacheroot, (cacheName + ".json") ), data.json );
            functions.writeFile( path.join( config.server.cacheroot, (cacheName + ".html") ), functions.squashHtml( data.html ) );

            renderTemplate( appRequest.params[ 0 ], qrs, data.json, functions.squashHtml( data.html ), function ( tpl ) {
                appResponse.status( 200 ).send( tpl );
            });
        });
    }
}


/**
 *
 * @method processArguments
 * @param {object} args The arguments array
 * @private
 *
 */
function processArguments( args ) {
    var data = functions.readJson( path.join( __dirname, "package.json" ) ),
        flags = {},
        commands = {};

    if ( !args || !args.length ) {
        console.log( "Squarespace Server" );
        console.log( "Version " + data.version );
        console.log();
        console.log( "Commands:" );
        console.log( "sqs buster       Delete local site cache" );
        console.log( "sqs server       Start the local server" );
        console.log();
        console.log( "Options:" );
        console.log( "sqs --version    Print package version" );
        console.log( "sqs --port=XXXX  Use the specified port" );
        console.log();
        console.log( "Examples:" );
        console.log( "sqs server --port=8000" );
        process.exit();
    }

    _.each( args, function ( arg ) {
        var rFlag = /^--/,
            split;

        if ( rFlag.test( arg ) ) {
            split = arg.split( "=" );
            flags[ split[ 0 ].replace( rFlag, "" ) ] = (split[ 1 ] || undefined);

        } else {
            commands[ arg ] = true;
        }
    });

    // Order of operations
    if ( flags.version ) {
        functions.log( data.version );
        process.exit();

    } else if ( commands.buster ) {
        fse.removeSync( path.join( config.server.cacheroot ) );
        functions.log( "Trashed your local .sqs-cache." );
        process.exit();

    } else if ( commands.server ) {
        if ( flags.port ) {
            config.server.port = flags.port;
        }

        startServer();
    }
}


/**
 *
 * @method onExpressRouterGET
 * @param {object} appRequest The express request
 * @param {object} appResponse The express response
 * @private
 *
 */
function onExpressRouterGET( appRequest, appResponse ) {
    var compose = _.compose(
            compositionDone,
            compileStylesheets,
            replaceSQSScripts,
            replaceScripts,
            replaceBlocks,
            compileRegions,
            compileCollections,
            setHeaderFooter,
            setSQSHeadersFooters
        );

    // Exit clause...
    if ( rIco.test( appRequest.params[ 0 ] ) || rApi.test( appRequest.params[ 0 ] ) ) {
        functions.log( "URL - " + appRequest.params[ 0 ] + " Not trying it" );

        appResponse.end();

        return;

    } else {
        functions.log( "GET - " + appRequest.params[ 0 ] );
    }

    // Logout
    if ( appRequest.params[ 0 ].replace( rSlash, "" ) === "logout" ) {
        functions.log( "AUTH - Logout of Squarespace!" );

        sqsUserData = null;

        appResponse.redirect( "/" );

        return;
    }

    // Authenticated
    if ( !sqsUserData ) {
        functions.log( "AUTH - Login to Squarespace!" );

        appResponse.send( functions.readFile( path.join( __dirname, "tpl/login.html" ) ) );

        return;
    }

    // Login expires
    if ( (Date.now() - sqsTimeOfLogin) >= sqsTimeLoggedIn ) {
        functions.log( "AUTH EXPIRED - Logout of Squarespace!" );

        appResponse.redirect( "/logout" );

        return;
    }

    // Compose public server
    compose(function () {
        onCompositionDone( appRequest, appResponse );
    });
}


/**
 *
 * @method onExpressRouterPOST
 * @param {object} appRequest The express request
 * @param {object} appResponse The express response
 * @private
 *
 */
function onExpressRouterPOST( appRequest, appResponse ) {
    var data = {
            email: appRequest.body.email,
            password: appRequest.body.password
        },
        apis = [
            (config.server.siteurl + API_GET_SITELAYOUT),
            (config.server.siteurl + API_GET_COLLECTIONS),
        ];

    if ( !data.email || !data.password ) {
        functions.log( "Email AND Password required." );

        appResponse.send( functions.readFile( path.join( __dirname, "tpl/login.html" ) ) );

        return;
    }

    sqsUserData = data;

    loginPortal(function ( headers ) {
        // Fetch site API data
        function getAPI() {
            var api = apis.shift(),
                pathName = path.join( config.server.cacheroot, (api.replace( config.server.siteurl, "" ).replace( rSlash, "" ).replace( /\//g, "-" ) + ".json") );

            request({
                url: api,
                json: true,
                headers: headers,
                qs: sqsUserData

            }, function ( error, response, json ) {
                functions.writeJson( pathName, json );

                // All done, load the site
                if ( !apis.length ) {
                    config.server.siteData.collections = json;

                    sqsTimeOfLogin = Date.now();

                    appResponse.json({
                        success: true
                    });

                } else {
                    config.server.siteData.siteLayout = json;

                    getAPI();
                }
            });
        }

        getAPI();
    });
}


/**
 *
 * @method startServer
 * @private
 *
 */
function startServer() {
    // Regex to match Squarespace Headers
    rSQSHeadersFull = new RegExp( "<\\!-- This is Squarespace. -->(.*?)<\\!-- End of Squarespace Headers -->" );

    // Create express application
    app.use( express.static( config.server.webroot ) );
    app.use( bodyParser.json() );
    app.use( bodyParser.urlencoded( {extended: true} ) );
    app.set( "port", config.server.port );
    app.get( "*", onExpressRouterGET );
    app.post( "/", onExpressRouterPOST );
    app.listen( app.get( "port" ) );

    // Log that the server is running
    functions.log( ("Running @http://localhost:" + app.get( "port" )) );
}


/**
 *
 * @export
 * @public
 * -------
 * @method init
 * @param {object} conf The template.conf json
 * @param {object} args The command arguments
 *
 */
module.exports = {
    init: function ( conf, args ) {
        // Create global config
        config = conf;

        // Create global config.server
        setServerConfig();

        // Create global directories
        setDirectories();

        // Handle arguments
        processArguments( args );
    }
};