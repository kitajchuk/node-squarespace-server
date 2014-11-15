/*!
 *
 * Squarespace request.
 *
 */
var _ = require( "underscore" ),
    request = require( "request" ),
    path = require( "path" ),
    fs = require( "fs" ),
    functions = require( "./lib/functions" ),
    sqsRender = require( "./squarespace-render" ),
    rSlash = /^\/|\/$/g,
    rJsonT = /^\{.*?\}$/,
    API_GET_SITELAYOUT = "/api/commondata/GetSiteLayout/",
    //API_GET_COLLECTION = "/api/commondata/GetCollection/", //?collectionId
    API_GET_COLLECTIONS = "/api/commondata/GetCollections/",
    //API_GET_TEMPLATE = "/api/template/GetTemplate/", // ?templateId
    API_GET_BLOCKFIELDS = "/api/block-fields/",
    //API_GET_WIDGETRENDERING = "/api/widget/GetWidgetRendering/",
    API_AUTH_LOGIN = "/api/auth/Login/",
    sqsLoginHeaders = null,
    config = null,
    sqsUser,


/******************************************************************************
 * @Public
*******************************************************************************/

/**
 *
 * @method setConfig
 * @param {object} conf The server configuration
 * @public
 *
 */
setConfig = function ( conf ) {
    config = conf;
},


/**
 *
 * @method setUser
 * @param {object} conf The directories
 * @public
 *
 */
setUser = function ( user ) {
    sqsUser = user;
},


/**
 *
 * @method getHeaders
 * @param {object} headers Merge object with required headers
 * @returns {object}
 * @private
 *
 */
getHeaders = function ( headers ) {
    var ret = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_9_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/37.0.2062.94 Safari/537.36"
    };

    if ( headers ) {
        ret = _.extend( ret, headers );
    }

    return ret;
},


/**
 *
 * @method loginPortal
 * @param {function} callback Fired when login and headers are set
 * @public
 *
 */
loginPortal = function ( callback ) {
    // POST to login
    request({
        method: "POST",
        url: (config.server.siteurl + API_AUTH_LOGIN),
        json: true,
        headers: getHeaders(),
        form: sqsUser

    }, function ( error, response, json ) {
        if ( error ) {
            functions.log( "ERROR - " + error );
            return;
        }

        // Request to TokenLogin
        request({
            url: json.targetWebsite.loginUrl,
            json: true,
            headers: getHeaders(),
            qs: sqsUser

        }, function ( error, response ) {
            if ( error ) {
                functions.log( "ERROR - " + error );
                return;
            }

            // Get the response cookie we need
            var cookie = response.headers[ "set-cookie" ].join( ";" );

            // Set request headers we will use
            headers = getHeaders({
                "Cookie": cookie
            });

            // Store headers here
            sqsLoginHeaders = headers;

            callback( headers );
        });
    });
},


/**
 *
 * @method fetchAPIData
 * @param {function} callback Fired when data is fetched
 * @public
 *
 */
fetchAPIData = function ( callback ) {
    var apis = [
            (config.server.siteurl + API_GET_SITELAYOUT),
            (config.server.siteurl + API_GET_COLLECTIONS),
        ],
        data = {};

    function getAPI() {
        var api = apis.shift(),
            pathName = path.join(
                config.server.cacheroot,
                (api.replace( config.server.siteurl, "" ).replace( rSlash, "" ).replace( /\//g, "-" ) + ".json")
            );

        request({
            url: api,
            json: true,
            headers: sqsLoginHeaders,
            qs: sqsUser

        }, function ( error, response, json ) {
            functions.writeJson( pathName, json );

            // All done, load the site
            if ( !apis.length ) {
                data.collections = json;

                callback( data );

            } else {
                data.siteLayout = json;

                getAPI();
            }
        });
    }

    getAPI();
},


/**
 *
 * @method requestHtml
 * @param {string} url Request url
 * @param {object} qrs Querystring mapping
 * @param {function} callback Fired when done
 * @public
 *
 */
requestHtml = function ( url, qrs, callback ) {
    request({
        url: url,
        headers: getHeaders(),
        qs: qrs

    }, function ( error, response, html ) {
        if ( error ) {
            functions.log( "ERROR - " + error );
            return;
        }

        callback( html );
    });
},


/**
 *
 * @method requestJson
 * @param {string} url Request url
 * @param {object} qrs Querystring mapping
 * @param {function} callback Fired when done
 * @public
 *
 */
requestJson = function ( url, qrs, callback ) {
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
            functions.log( "ERROR - " + error );
            return;
        }

        callback( json );
    });
},


/**
 *
 * @method requestJsonAndHtml
 * @param {string} url Request url
 * @param {object} qrs Querystring mapping
 * @param {function} callback Fired when done
 * @public
 *
 */
requestJsonAndHtml = function ( url, qrs, callback ) {
    var res = {};

    requestJson( url, qrs, function ( json ) {
        res.json = json;

        requestHtml( url, qrs, function ( html ) {
            res.html = html;

            callback( res );
        });
    });
},


/**
 *
 * @method requestQuery
 * @param {object} query Regex matched object
 * @param {object} qrs Querystring mapping
 * @param {object} pageJson The page JSON
 * @param {function} callback Fired when done
 * @public
 *
 */
requestQuery = function ( query, qrs, pageJson, callback ) {
    var data = functions.getAttrObj( query[ 1 ] ),
        match = data.collection.match( rJsonT ),
        qs = {},
        url,
        slg;

    if ( match ) {
        match = match[ 0 ];

        data.collection = sqsRender.renderJsonTemplate( match, pageJson );
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
        functions.log( "CACHE - Loading cached query" );

        callback( query, data, functions.readJson( slg ) );

    } else {
        if ( qrs.nocache !== undefined ) {
            functions.log( "CACHE - Clearing cached query: ", data.collection );
        }

        request({
            url: url,
            json: true,
            headers: getHeaders(),
            qs: qs

        }, function ( error, response, json ) {
            if ( error ) {
                functions.log( "ERROR - " + error );
                return;
            }

            functions.writeJson( slg, json );

            callback( query, data, json );
        });
    }
};


/******************************************************************************
 * @Export
*******************************************************************************/
module.exports = {
    setConfig: setConfig,
    setUser: setUser,
    loginPortal: loginPortal,
    requestQuery: requestQuery,
    requestJson: requestJson,
    requestHtml: requestHtml,
    requestJsonAndHtml: requestJsonAndHtml,
    fetchAPIData: fetchAPIData,

    // @temp: remove this when block-field rending is resolved
    API_GET_BLOCKFIELDS: API_GET_BLOCKFIELDS
};