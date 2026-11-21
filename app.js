const $ = s => document.querySelector(s);
const clock = $('#clock'), dateEl = $('#date');
function tick(){const d=new Date();clock.textContent=new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit'}).format(d);dateEl.textContent=new Intl.DateTimeFormat('ru-RU',{weekday:'long',day:'numeric',month:'long'}).format(d).toLocaleUpperCase('ru-RU')}
tick();setInterval(tick,1000);
document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('.content').forEach(x=>x.classList.toggle('active',x.id===b.dataset.tab));}));
const STORE='holdom-shopping-v1';let items=JSON.parse(localStorage.getItem(STORE)||'[]');
function render(){const list=$('#shopping-list');list.replaceChildren();items.forEach((item,i)=>{const li=document.createElement('li');li.className=item.done?'done':'';const toggle=document.createElement('button');toggle.className='item-toggle';toggle.textContent=item.done?'✓':'';toggle.onclick=()=>{items[i].done=!items[i].done;save()};const name=document.createElement('span');name.className='item-name';name.textContent=item.name;const del=document.createElement('button');del.className='item-delete';del.textContent='×';del.setAttribute('aria-label','Удалить');del.onclick=()=>{items.splice(i,1);save()};li.append(toggle,name,del);list.append(li)});$('#shopping-count').textContent=items.filter(x=>!x.done).length;localStorage.setItem(STORE,JSON.stringify(items))}
function save(){render()}
$('#shopping-form').addEventListener('submit',e=>{e.preventDefault();const input=$('#shopping-input');const name=input.value.trim();if(!name)return;items.push({name,done:false});input.value='';save()});
$('#clear-done').onclick=()=>{items=items.filter(x=>!x.done);save()};
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
render();
