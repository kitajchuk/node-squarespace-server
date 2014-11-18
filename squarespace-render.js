/*!
 *
 * Squarespace render.
 *
 */
var jsonTemplate = require( "./lib/jsontemplate" ),
    jsontOptions = {
        more_formatters: require( "./lib/formatters" ),
        more_predicates: require( "./lib/predicates" ),
        undefined_str: ""
    },
    issueIfBlocks = [
        "categories",
        "categoryFilter"
    ],


/******************************************************************************
 * @Private
*******************************************************************************/

replaceIssueIfBlocks = function ( render ) {
    var match;

    for ( var i = issueIfBlocks.length; i--; ) {
        while ( match = render.match( new RegExp( "{\\.if\s" + issueIfBlocks[ i ] + "}" ) ) ) {
            render = render.replace( match[ 0 ], "{.section " + issueIfBlocks[ i ] + "}" );
            render = render.replace( new RegExp( "{\\.repeated section " + issueIfBlocks[ i ] + "}" ), "{.repeated section @}" );
        }
    }

    return render;
},


/******************************************************************************
 * @Public
*******************************************************************************/

/**
 *
 * @method renderJsonTemplate
 * @param {string} render The template string
 * @param {object} data The data context
 * @returns {string}
 * @public
 *
 */
renderJsonTemplate = function ( render, data ) {
    // @temporary fix
    // @issues: {.if categories}...{.end} seems to blow up unanimously
    // @issues: {.if categoryFilter}...{.end} seems to blow up unanimously
    //render = replaceIssueIfBlocks( render );

    render = jsonTemplate.Template( render, jsontOptions );
    render = render.expand( data );

    return render;
};


/******************************************************************************
 * @Export
*******************************************************************************/
module.exports = {
    renderJsonTemplate: renderJsonTemplate
};