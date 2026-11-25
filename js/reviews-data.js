/* reviews-data.js — the reviews shown on reviews.html.

   Add a review here only once it has come in from a real customer (through the
   "write a review" form, by email or by text) and you have checked it matches a
   real job. Copy their words as written. Newest can go first; the page sorts them.

   One review looks like this (rating 1 to 5, date as YYYY-MM-DD, town optional):

   {
     name: 'Sam',
     rating: 5,
     service: 'House removal',     // as listed in the form's "Service used"
     town: 'Leeds',
     date: '2026-10-02',
     title: 'Smooth from start to finish',
     text: 'What the customer wrote.'
   },
*/

(function (NW) {
  'use strict';

  NW.reviewsData = [
    // real reviews go here
  ];
})(window.Sunrise = window.Sunrise || {});
