import { quoteExchange } from './economy.js';
import { LangMgr } from '../lang.js';
let dialog;
/** A facility in the map: entry only opens a quote; confirmation recomputes against live balances. */
export function openMapBank(session) {
    if (dialog?.open)
        return;
    const en = LangMgr.lang === 'en';
    const label = (zh, english) => en ? english : zh;
    const host = document.createElement('dialog');
    dialog = host;
    host.id = 'map-bank-dialog';
    host.style.cssText = 'max-width:min(30rem,90vw);padding:1.2rem;border:1px solid #6f8c7d;border-radius:12px;background:Canvas;color:CanvasText;';
    const heading = document.createElement('h2');
    heading.textContent = session.title || label('银行', 'Bank');
    const balance = document.createElement('p');
    const form = document.createElement('form');
    form.method = 'dialog';
    const direction = document.createElement('select');
    direction.id = 'bank-direction';
    direction.style.width = '100%';
    const name = (id) => session.names[id] ?? id;
    for (const [index, rule] of session.bank.rules.entries()) {
        const option = document.createElement('option');
        option.value = String(index);
        option.textContent = `${name(rule.from)} → ${name(rule.to)}`;
        direction.append(option);
    }
    const directionLabel = document.createElement('label');
    directionLabel.textContent = label('兑换方向 ', 'Direction ');
    directionLabel.append(direction);
    const amount = document.createElement('input');
    amount.type = 'number';
    amount.id = 'bank-amount';
    amount.min = '0';
    amount.step = 'any';
    amount.required = true;
    amount.style.width = '100%';
    const amountLabel = document.createElement('label');
    amountLabel.textContent = label('兑换本金（手续费另扣） ', 'Principal (fee charged separately) ');
    amountLabel.append(amount);
    const policy = document.createElement('p');
    policy.id = 'bank-policy';
    const quote = document.createElement('p');
    quote.id = 'bank-quote';
    quote.setAttribute('aria-live', 'polite');
    const submit = document.createElement('button');
    submit.id = 'bank-confirm';
    submit.type = 'submit';
    submit.textContent = label('确认兑换', 'Confirm exchange');
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = label('离开银行', 'Leave bank');
    close.onclick = () => host.close();
    const update = () => {
        const current = session.balances();
        balance.textContent = Object.entries(current).map(([id, value]) => `${name(id)}: ${value}`).join(' · ');
        const rule = session.bank.rules[Number(direction.value)];
        policy.textContent = `${label('汇率', 'Rate')} ${rule.rate}; ${label('手续费', 'Fee')} ${rule.feeRate * 100}% + ${rule.feeFixed}; ${label('最低本金', 'Minimum')} ${rule.minimum}; ${label('舍入', 'Rounding')} ${rule.rounding} (${rule.precision})`;
        try {
            const result = quoteExchange(current, session.bank, rule.from, Number(amount.value), rule.to);
            quote.textContent = `${label('扣款', 'Debit')} ${result.debit} ${name(result.from)} (${label('手续费', 'fee')} ${result.fee}); ${label('到账', 'Credit')} ${result.credit} ${name(result.to)}`;
            submit.disabled = false;
        }
        catch (error) {
            quote.textContent = error instanceof Error ? error.message : String(error);
            submit.disabled = true;
        }
    };
    direction.onchange = update;
    amount.oninput = update;
    form.onsubmit = event => {
        event.preventDefault();
        try {
            const rule = session.bank.rules[Number(direction.value)];
            // A displayed quote never reserves funds and is never trusted on confirmation.
            const result = quoteExchange(session.balances(), session.bank, rule.from, Number(amount.value), rule.to);
            session.commit(result);
            update();
        }
        catch (error) {
            quote.textContent = error instanceof Error ? error.message : String(error);
            submit.disabled = true;
        }
    };
    form.append(directionLabel, amountLabel, policy, quote, submit, document.createTextNode(' '), close);
    host.append(heading, balance, form);
    document.body.append(host);
    host.addEventListener('close', () => { host.remove(); if (dialog === host)
        dialog = undefined; });
    host.showModal();
    update();
    amount.focus();
}
//# sourceMappingURL=bank-ui.js.map