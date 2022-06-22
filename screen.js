var blessed = require('blessed');


// Create a screen object.
var screen = blessed.screen({
  smartCSR: true
});
exports.screen = screen;

var elements = {
}
exports.elements = elements;

var box_main = blessed.box({
    top: 'center',
    left: '0',
    width: '70%',
    height: '100%',
    content: '{bold}CartograPlant Administration Interface{/bold}',
    tags: true,
    border: {
        type: 'line'
    },
    style: {
        fg: 'white',
        bg: 'green',
        border: {
        fg: '#f0f0f0'
        },
        hover: {
        bg: 'green'
        }
    },
    keys: true,
    vi: true,
    alwaysScroll:true,
    scrollable: true,
    scrollbar: {
        style: {
            bg: 'yellow'
        }
    }    
});
elements.box_main = box_main;

var box_right = blessed.box({
    top: '50%',
    right: '0',
    width: '30%',
    height: '50%',
    content: '{bold}Other Window{/bold}',
    tags: true,
    border: {
        type: 'line'
    },
    style: {
        fg: 'white',
        bg: 'blue',
        border: {
        fg: '#f0f0f0'
        },
        hover: {
        bg: 'green'
        }
    },
    keys: true,
    vi: true,
    alwaysScroll:true,
    scrollable: true,
    scrollbar: {
        style: {
            bg: 'yellow'
        }  
    }  
});
elements.box_right = box_right;

var box_right_top = blessed.box({
    top: '0',
    right: '0',
    width: '30%',
    height: '50%',
    content: '{bold}Resource Window{/bold}',
    tags: true,
    border: {
        type: 'line'
    },
    style: {
        fg: 'white',
        bg: 'blue',
        border: {
        fg: '#f0f0f0'
        },
        hover: {
        bg: 'green'
        }
    },
    keys: true,
    vi: true,
    alwaysScroll:true,
    scrollable: true,
    scrollbar: {
        style: {
            bg: 'yellow'
        }  
    }  
});
elements.box_right_top = box_right_top;

var init = function init() {
    screen.title = 'my window title';
    // Create a box perfectly centered horizontally and vertically.
    
    // Append our box to the screen.
    screen.append(elements.box_main);
    screen.append(elements.box_right_top);
    screen.append(elements.box_right);

    screen.key(['C-c'], function(ch, key) {
        return process.exit(0);
    });

    screen.key(['1'], function(ch, key) {
        try {
            if (global.gc) {global.gc();}
            output('box_main', "Garbage collector executed.");
          } catch (e) {
            output('box_main', "node --expose-gc index.js");
            //process.exit();
          }        
    });    

    elements.box_main.on('click', function(data) {
        elements.box_main.focus();
        screen.render();
    });
    
    elements.box_right.on('click', function(data) {
        elements.box_right.focus();
        screen.render();
    });    

    // Focus our element.
    elements.box_main.focus();
    
    // Render the screen.
    screen.render();    
}
exports.init = init;


var output = function output(window_name, lines, scrollDownAll = true) {
    try {
        eval('elements.' + window_name).insertBottom(lines);
        if(scrollDownAll == true) {
            eval('elements.' + window_name).setScrollPerc(100);
        }
        screen.render();
    }
    catch (err) {
        
    }
}
exports.output = output;

var scrollDownAll = function scrollDownAll(window_name, lines) {
    try {
        eval('elements.' + window_name).setScrollPerc(100);
        screen.render();
    }
    catch (err) {
        
    }
}
exports.scrollDownAll = scrollDownAll;

var clear = function clear(window_name) {
    try {
        eval('elements.' + window_name).setContent('');
        screen.render();
    }
    catch (err) {
        
    }
}
exports.clear = clear;
