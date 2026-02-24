/**
 * ProtoContext Admin JS
 */
(function ($) {
    'use strict';

    var sectionIndex = $('#protocontext-sections-list .protocontext-section-item').length;

    // Toggle manual sections visibility
    $('input[name="protocontext_settings[mode]"]').on('change', function () {
        if ($(this).val() === 'manual') {
            $('.protocontext-manual-sections').slideDown(200);
        } else {
            $('.protocontext-manual-sections').slideUp(200);
        }
    });

    // Add section
    $('#protocontext-add-section').on('click', function () {
        var html = '<div class="protocontext-section-item" data-index="' + sectionIndex + '">' +
            '<div class="section-header">' +
            '<input type="text" name="protocontext_sections[' + sectionIndex + '][title]" value="" placeholder="Section Title" class="regular-text" />' +
            '<button type="button" class="button protocontext-remove-section">Remove</button>' +
            '</div>' +
            '<textarea name="protocontext_sections[' + sectionIndex + '][body]" rows="5" class="large-text" placeholder="Section content... Plain text, no HTML."></textarea>' +
            '<span class="char-count">0 / 1000 chars</span>' +
            '</div>';

        $('#protocontext-sections-list').append(html);
        sectionIndex++;
    });

    // Remove section
    $(document).on('click', '.protocontext-remove-section', function () {
        $(this).closest('.protocontext-section-item').slideUp(200, function () {
            $(this).remove();
        });
    });

    // Char counter
    $(document).on('input', '.protocontext-section-item textarea', function () {
        var len = $(this).val().length;
        var counter = $(this).siblings('.char-count');
        counter.text(len + ' / 1000 chars');
        if (len > 1000) {
            counter.addClass('over-limit');
        } else {
            counter.removeClass('over-limit');
        }
    });

    // Init char counters
    $('.protocontext-section-item textarea').trigger('input');

    // Preview
    $('#protocontext-preview-btn').on('click', function () {
        var $btn = $(this);
        var $preview = $('#protocontext-preview');

        $btn.prop('disabled', true).text('Loading...');
        $preview.text('Generating preview...');

        $.post(protocontextAdmin.ajaxUrl, {
            action: 'protocontext_preview',
            nonce: protocontextAdmin.nonce
        }, function (response) {
            if (response.success) {
                $preview.text(response.data.content);
            } else {
                $preview.text('Error generating preview.');
            }
            $btn.prop('disabled', false).text('Refresh Preview');
        }).fail(function () {
            $preview.text('Request failed.');
            $btn.prop('disabled', false).text('Refresh Preview');
        });
    });

})(jQuery);
