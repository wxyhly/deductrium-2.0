import { SyntaxViewer, SyntaxEditor } from '../../js/astrender.js';
import { HSParser } from '../../js/hs/core/parser.js';
import { TypeParser } from '../../js/tt/parser.js';

// Open assertions.html through the same HTTP server as the application.
export function runAssertionChecks(fixtures) {
    let count = 0;
    const check = (value, message) => {
        if (!value) throw new Error(message);
        count++;
    };
    const view = (text, expected, mode = 'wff', parser = new HSParser) => {
        const host = document.createElement('div');
        fixtures.append(host);
        const viewer = new SyntaxViewer(host, parser, text, mode);
        check(host.querySelectorAll('.ast-compact').length === expected, `compact count: ${text}`);
        check(viewer.getCode() === text && host.textContent === text, `source round trip: ${text}`);
        return { host, viewer };
    };
    const nf = view('#nf($,$y)', 1);
    const dt = view('#dt($x $y $z)', 1);
    const sb = view('#sb($,$x,$A)', 1);
    const nested = view('#sb(#sb($,$x,$A),$y,0)', 2);
    view('(#nf($,$y))', 1);
    view('((#sb($,$x,$A)))', 1);
    view('#nf( $ , $y )', 1);
    view('#dt( $x $y )', 1);
    view('#sb( $ , $x , $A )', 1);
    view('#nf ( $ , $y )', 0); // The parser treats this as an identifier, not a call.
    const scopedNF = view('#nf($,$x $y,$z)', 1);
    const scopedSB = view('#sb($,$x,$A,$z)', 1);
    view('#sb($,$x,$A', 0);
    view('#nf($,', 0);
    const trailing = view('#sb($,$x,$A) garbage', 1);
    check(trailing.host.innerText.includes('garbage'), 'trailing input stays visible');
    view('true : True', 0, undefined, new TypeParser);
    check(nf.host.querySelector('sub').textContent === '$y', 'nf variables are subscripts');
    check(sb.host.querySelector('sup').textContent === '$x', 'sb source is superscript');
    check(sb.host.querySelector('sub').textContent === '$A', 'sb target is subscript');
    check(scopedNF.host.querySelector('.ast-compact-scope').textContent === '$z', 'nf scope remains visible');
    check(scopedSB.host.querySelector('.ast-compact-scope').textContent === '$z', 'sb scope remains visible');
    check(dt.host.title === '' && dt.host.firstElementChild.title.includes('两两不同'), 'dt means pairwise distinct');
    check(getComputedStyle(dt.host.firstElementChild, '::after').content.includes('≠'), 'dt distinct annotation');
    check(getComputedStyle(nf.host.querySelector('.ast-compact-syntax')).display === 'none', 'function punctuation hidden');
    check(getComputedStyle(sb.host.querySelector('.ast-compact-target'), '::before').content.includes('↘'), 'substitution arrow');

    let clicked;
    SyntaxViewer.onClickAst = text => clicked = text;
    sb.host.firstElementChild.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    check(clicked === sb.viewer.getCode(), 'click decoration inserts full source');
    sb.host.querySelector('sup span').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    check(clicked === '$x', 'click parameter inserts its source');
    SyntaxViewer.onClickAst = null;

    const copy = () => {
        const data = new DataTransfer();
        const event = new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true });
        document.dispatchEvent(event);
        check(event.defaultPrevented, 'compact selection uses source copying');
        return data.getData('text/plain');
    };
    const selection = document.getSelection();
    const bodyToken = sb.host.querySelector('.ast-compact-body span').firstChild;
    selection.setBaseAndExtent(bodyToken, 0, bodyToken, bodyToken.length);
    check(copy() === sb.viewer.getCode(), 'partial selection copies complete assertion');
    const nestedToken = nested.host.querySelector('.ast-compact-body .ast-compact-body span').firstChild;
    selection.setBaseAndExtent(nestedToken, nestedToken.length, nestedToken, 0);
    check(copy() === nested.viewer.getCode(), 'nested backward selection copies complete outer source');
    // Selection crosses viewer boundaries and bubbles to document, not either viewer.
    const cross = document.createElement('section');
    fixtures.append(cross);
    nf.host.style.display = sb.host.style.display = 'inline';
    cross.append(nf.host, document.createTextNode(' ; '), sb.host);
    const first = nf.host.querySelector('.ast-compact-body span').firstChild;
    selection.setBaseAndExtent(first, 0, bodyToken, bodyToken.length);
    check(copy() === nf.viewer.getCode() + ' ; ' + sb.viewer.getCode(), 'copy across viewers');
    cross.replaceChildren(nf.host, sb.host);
    nf.host.style.display = sb.host.style.display = 'block';
    selection.setBaseAndExtent(first, 0, bodyToken, bodyToken.length);
    check(copy() === nf.viewer.getCode() + '\n' + sb.viewer.getCode(), 'copy across rows keeps line separators');
    const hiddenHelp = document.createElement('div');
    hiddenHelp.style.display = 'none';
    hiddenHelp.textContent = 'HIDDEN HELP';
    cross.insertBefore(hiddenHelp, sb.host);
    selection.setBaseAndExtent(first, 0, bodyToken, bodyToken.length);
    check(copy() === nf.viewer.getCode() + '\n' + sb.viewer.getCode(), 'copy ignores hidden UI while preserving hidden assertion syntax');
    selection.removeAllRanges();

    const mount = document.createElement('div');
    fixtures.append(mount);
    const editor = new SyntaxEditor(mount, new HSParser, '#nf($,$y)', 'wff');
    check(editor.getValue() === '#nf($,$y)', 'editor source stays literal');
    check(!mount.querySelector('.ast-compact'), 'editor overlay stays literal');
    const bounded = view('∀x:#sb((x=x),x,0)', 1);
    const variable = bounded.host.querySelector('span[data-start="1"]');
    variable.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    check(bounded.host.querySelectorAll('.ast-highlight').length > 1, 'bound occurrences still highlight');
    return count;
}
