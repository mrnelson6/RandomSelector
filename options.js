// Default option list. One entry per bin at the bottom of the board.
// Every option can come out positive (+) or negative (-), decided by the
// zones halfway down the board, so N options = 2N possible outcomes.
//
// Edit this list, commit, and push to update the site. Visitors can also
// paste their own list in the Options panel (saved in their browser only).

window.DEFAULT_OPTIONS = Array.from({ length: 150 }, (_, i) => "Option " + (i + 1));
