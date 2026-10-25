/* Rodapé: ano atual */
(function (S) {
  'use strict';

  var yr = S.$('#yr');
  if (yr) yr.textContent = new Date().getFullYear();
})(window.Site);
