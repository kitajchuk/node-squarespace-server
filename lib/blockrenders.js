var renders = {
    video: function ( json ) {
        var html = '<div class="sqs-video-wrapper video-none" data-html="' + json.value.html.replace( /"/g, "&quot;" ) + '" data-provider-name>';

        if ( json.value.overlay ) {
            html += '<div class="sqs-video-overlay" style="opacity: 0;">';
            // image...
            html += '<div class="sqs-video-opaque"></div>';
            html += '<div class="sqs-video-icon"></div>';
            html += '</div>';
        }

        html += '</div>';

        if ( json.value.description && json.value.description.html ) {
            html += '<div class="video-caption-wrapper">';
            html += '<div class="video-caption">';
            html += json.value.description.html;
            html += '</div>';
            html += '</div>';
        }

        return html;
    }
};

module.exports = function ( json, type ) {
    var ret = json.value.html;

    if ( renders[ type ] ) {
        ret = renders[ type ].call( renders, json );
    }

    return ret;
};