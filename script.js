/**
 * Calculadora de Liquidación Laboral — El Salvador
 * Conforme al Código de Trabajo (Decreto N° 15, 1972), Ley 592 (2014)
 * y la Reforma al Aguinaldo aprobada el 23-sep-2026 (pago desde 1-oct).
 */

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const fmtFrac = (n) => {
  let s = n.toFixed(4);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s;
};
const fmtDate = (isoStr) => {
  if (!isoStr) return '— No especificada —';
  const [y, m, d] = isoStr.split('-');
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return `${parseInt(d,10)} de ${meses[parseInt(m,10)-1]} de ${y}`;
};
const setTxt = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
const toISO = (d) => { const p=(n)=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; };

const form = document.getElementById('calc-form');
const errorBox = document.getElementById('error-box');
const resultSection = document.getElementById('resultado');

/* =========================================================
 * FERIADOS DE EL SALVADOR
 * ========================================================= */
function getEaster(year) {
  const a = year % 19, b = Math.floor(year/100), c = year % 100;
  const d = Math.floor(b/4), e = b % 4, f = Math.floor((b+8)/25);
  const g = Math.floor((b-f+1)/3), h = (19*a+b-d-g+15)%30;
  const i = Math.floor(c/4), k = c % 4;
  const l = (32+2*e+2*i-h-k)%7, m = Math.floor((a+11*h+22*l)/451);
  const month = Math.floor((h+l-7*m+114)/31), day = ((h+l-7*m+114)%31)+1;
  return new Date(year, month-1, day);
}

function getFeriados(year) {
  const feriados = [];
  const fijos = [
    {mes:0, dia:1, nombre:'Año Nuevo', tipo:'Nacional'},
    {mes:4, dia:1, nombre:'Día del Trabajo', tipo:'Nacional'},
    {mes:4, dia:10, nombre:'Día de las Madres', tipo:'Nacional'},
    {mes:5, dia:17, nombre:'Día del Padre', tipo:'Nacional'},
    {mes:7, dia:3, nombre:'Fiestas de San Salvador (día central)', tipo:'Local — San Salvador'},
    {mes:7, dia:5, nombre:'Fiestas de San Salvador', tipo:'Local — San Salvador'},
    {mes:7, dia:6, nombre:'Divino Salvador del Mundo', tipo:'Nacional'},
    {mes:8, dia:15, nombre:'Independencia de El Salvador', tipo:'Nacional'},
    {mes:10, dia:2, nombre:'Día de los Difuntos', tipo:'Nacional'},
    {mes:10, dia:21, nombre:'Fiestas Patronales de San Miguel', tipo:'Local — San Miguel'},
    {mes:11, dia:25, nombre:'Navidad', tipo:'Nacional'},
    {mes:6, dia:26, nombre:'Fiestas Patronales de Santa Ana', tipo:'Local — Santa Ana'},
  ];
  fijos.forEach(f => feriados.push({ fecha:new Date(year,f.mes,f.dia), nombre:f.nombre, tipo:f.tipo }));
  const easter = getEaster(year);
  const js = new Date(easter); js.setDate(easter.getDate()-3);
  const vs = new Date(easter); vs.setDate(easter.getDate()-2);
  const ss = new Date(easter); ss.setDate(easter.getDate()-1);
  feriados.push(
    {fecha:js, nombre:'Jueves Santo', tipo:'Semana Santa'},
    {fecha:vs, nombre:'Viernes Santo', tipo:'Semana Santa'},
    {fecha:ss, nombre:'Sábado Santo', tipo:'Semana Santa'}
  );
  feriados.sort((a,b)=>a.fecha-b.fecha);
  return feriados;
}

/* =========================================================
 * CLASIFICACIÓN DE HORAS EXTRAS (diurnas vs nocturnas)
 * Diurna: 6:00 AM – 7:00 PM | Nocturna: 7:00 PM – 6:00 AM
 * ========================================================= */
function clasificarHoras(startTime, endTime) {
  const toMin = (s) => { const [h,m]=s.split(':').map(Number); return h*60+m; };
  let start = toMin(startTime), end = toMin(endTime);
  if (end <= start) end += 1440;
  let diurnas = 0, nocturnas = 0, current = start;
  while (current < end) {
    const dayStart = Math.floor(current/1440)*1440;
    const posInDay = current - dayStart;
    let segmentEnd, isDiurna;
    if (posInDay < 360) { isDiurna=false; segmentEnd=dayStart+360; }
    else if (posInDay < 1140) { isDiurna=true; segmentEnd=dayStart+1140; }
    else { isDiurna=false; segmentEnd=dayStart+1440; }
    segmentEnd = Math.min(segmentEnd, end);
    const dur = (segmentEnd-current)/60;
    if (isDiurna) diurnas += dur; else nocturnas += dur;
    current = segmentEnd;
  }
  return { diurnas:Math.round(diurnas*100)/100, nocturnas:Math.round(nocturnas*100)/100 };
}

/* =========================================================
 * UTILIDADES DE FECHAS
 * ========================================================= */
function diffFechas(isoIngreso, isoTerminacion) {
  if (!isoIngreso || !isoTerminacion) return null;
  const ingreso = new Date(isoIngreso+'T00:00:00'), term = new Date(isoTerminacion+'T00:00:00');
  if (isNaN(ingreso) || isNaN(term) || term <= ingreso) return null;
  let anios = term.getFullYear()-ingreso.getFullYear();
  let meses = term.getMonth()-ingreso.getMonth();
  let dias = term.getDate()-ingreso.getDate();
  if (dias<0){ meses-=1; dias += new Date(term.getFullYear(),term.getMonth(),0).getDate(); if(dias<0){meses-=1;dias+=30;} }
  if (meses<0){ anios-=1; meses+=12; }
  dias+=1;
  if (dias>=30){dias-=30;meses+=1;}
  if (meses>=12){meses-=12;anios+=1;}
  return {anios,meses,dias};
}

function dec12Reciente(isoTerminacion) {
  const term = new Date(isoTerminacion+'T00:00:00');
  let base = new Date(term.getFullYear(),11,12);
  if (term < base) base = new Date(term.getFullYear()-1,11,12);
  return base;
}

/* =========================================================
 * MANEJO DEL FORMULARIO
 * ========================================================= */
const fechaIngresoInput = document.getElementById('fechaIngreso');
const fechaTerminacionInput = document.getElementById('fechaTerminacion');
const aniosInput = document.getElementById('anios');
const mesesInput = document.getElementById('meses');
const mesesHint = document.getElementById('meses-hint');
const fechaTermHint = document.getElementById('fecha-term-hint');

// Validación de fechas según causa
function validarFechas() {
  const causa = document.querySelector('input[name="causa"]:checked')?.value;
  const hoy = toISO(new Date());
  fechaIngresoInput.max = hoy;
  if (causa === 'despido') {
    fechaTerminacionInput.max = hoy;
    fechaTermHint.textContent = 'La fecha de terminación no puede ser posterior a hoy (despido injustificado).';
  } else if (causa === 'renuncia') {
    fechaTerminacionInput.removeAttribute('max');
    fechaTermHint.textContent = 'Puede seleccionar fechas futuras para previsualizar sus beneficios (renuncia voluntaria).';
  }
  sincronizarAntiguedad();
}

// Antigüedad automática (readonly)
function sincronizarAntiguedad() {
  const calc = diffFechas(fechaIngresoInput.value, fechaTerminacionInput.value);
  if (calc) {
    aniosInput.value = calc.anios;
    mesesInput.value = calc.meses;
    mesesHint.textContent = `Calculado: ${calc.anios} años, ${calc.meses} meses${calc.dias>0?` y ${calc.dias} días`:''} (incluye último día).`;
  } else {
    aniosInput.value = '';
    mesesInput.value = '';
    mesesHint.textContent = 'Complete ambas fechas para calcular la antigüedad.';
  }
  actualizarRenunciaHint();
}

fechaIngresoInput.addEventListener('change', validarFechas);
fechaTerminacionInput.addEventListener('change', validarFechas);

/* =========================================================
 * CAUSA: RENUNCIA — NOTIFICACIÓN
 * ========================================================= */
const tipoEmpleadoSelect = document.getElementById('tipoEmpleado');
const preavisoDiasInput = document.getElementById('preavisoDias');

function actualizarRenunciaUI() {
  const causa = document.querySelector('input[name="causa"]:checked')?.value;
  const esRenuncia = causa === 'renuncia';
  document.getElementById('renuncia-box').classList.toggle('hidden', !esRenuncia);
  if (!esRenuncia) return;

  const notifico = document.querySelector('input[name="notificoRenuncia"]:checked')?.value === 'si';
  document.getElementById('renuncia-detalles').classList.toggle('hidden', !notifico);
  document.getElementById('renuncia-no-notifico').classList.toggle('hidden', notifico);
}

function actualizarPreavisoHint() {
  const gerente = tipoEmpleadoSelect.value === 'gerente';
  const req = gerente ? 30 : 15;
  document.getElementById('preaviso-hint').textContent =
    `Requeridos por ley: ${req} días de anticipación (${gerente?'cargo de dirección, jefatura o especializado':'demás trabajadores'}). Art. 2, Ley 592.`;
}

function actualizarRenunciaHint() {
  const hint = document.getElementById('renuncia-requisitos-hint');
  const causa = document.querySelector('input[name="causa"]:checked')?.value;
  if (causa !== 'renuncia') { hint.textContent=''; hint.className='field-hint hidden'; return; }

  const notifico = document.querySelector('input[name="notificoRenuncia"]:checked')?.value === 'si';
  const calc = diffFechas(fechaIngresoInput.value, fechaTerminacionInput.value);
  let total = calc ? calc.anios + (calc.meses*30+calc.dias)/360 : null;
  const req = tipoEmpleadoSelect.value === 'gerente' ? 30 : 15;
  const dias = Math.max(parseInt(preavisoDiasInput.value,10)||0, 0);
  const cumplePre = dias >= req;
  const notificadoOk = notifico;

  let txt = '';
  if (total !== null) {
    const cumpleAnios = total >= 2;
    txt = `Requisitos (Art. 2, Ley 592): mínimo 2 años — ${cumpleAnios?'CUMPLE':'NO CUMPLE'} (${total.toFixed(2)} años); `;
    txt += `preaviso escrito de ${req} días — ${notificadoOk?(cumplePre?'CUMPLE':'NO CUMPLE')+' ('+dias+' día(s))':'NO NOTIFICÓ'}. `;
    if (!cumpleAnios || !notificadoOk || !cumplePre) txt += 'La prestación por renuncia NO procede si no se cumple un requisito.';
  } else {
    txt = `Requisitos (Art. 2, Ley 592): preaviso escrito de ${req} días — ${notificadoOk?(cumplePre?'CUMPLE':'NO CUMPLE')+' ('+dias+' día(s))':'NO NOTIFICÓ'}. Ingrese las fechas para verificar el mínimo de 2 años.`;
  }
  hint.textContent = txt;
  const noCumple = (total!==null && total<2) || !notificadoOk || !cumplePre;
  hint.className = noCumple ? 'mnote mnote--alert mt-3' : 'field-hint';
}

document.querySelectorAll('input[name="causa"]').forEach(r => {
  r.addEventListener('change', () => { validarFechas(); actualizarRenunciaUI(); });
});
document.querySelectorAll('input[name="notificoRenuncia"]').forEach(r => {
  r.addEventListener('change', () => { actualizarRenunciaUI(); actualizarRenunciaHint(); });
});
tipoEmpleadoSelect.addEventListener('change', () => { actualizarPreavisoHint(); actualizarRenunciaHint(); });
preavisoDiasInput.addEventListener('input', actualizarRenunciaHint);

/* =========================================================
 * COMISIONES
 * ========================================================= */
document.getElementById('comisiones-si').addEventListener('change', function() {
  if (this.checked) document.getElementById('comisiones-monto-box').classList.remove('hidden');
});
document.getElementById('comisiones-no').addEventListener('change', function() {
  if (this.checked) document.getElementById('comisiones-monto-box').classList.add('hidden');
});

/* =========================================================
 * HORAS EXTRAS — ENTRADAS DINÁMICAS
 * ========================================================= */
let heEntries = [];
let heCounter = 0;

function agregarEntradaHE() {
  heCounter++;
  const container = document.getElementById('he-entries');
  const div = document.createElement('div');
  div.className = 'he-entry';
  div.innerHTML = `
    <div><label>Fecha</label><input type="date" data-he="fecha" required></div>
    <div><label>Hora inicio</label><input type="time" data-he="inicio" required></div>
    <div><label>Hora fin</label><input type="time" data-he="fin" required></div>
    <button type="button" class="he-remove" onclick="this.parentElement.remove(); recalcularHE();">✕</button>
    <div class="he-result"></div>
  `;
  container.appendChild(div);
  div.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('change', () => actualizarEntradaHE(div));
  });
}

function actualizarEntradaHE(div) {
  const fecha = div.querySelector('[data-he="fecha"]').value;
  const inicio = div.querySelector('[data-he="inicio"]').value;
  const fin = div.querySelector('[data-he="fin"]').value;
  const resultEl = div.querySelector('.he-result');
  if (fecha && inicio && fin) {
    const {diurnas, nocturnas} = clasificarHoras(inicio, fin);
    resultEl.innerHTML = `→ <strong>${diurnas}</strong> h diurnas + <strong>${nocturnas}</strong> h nocturnas`;
  } else {
    resultEl.textContent = '';
  }
  recalcularHE();
}

function recalcularHE() {
  let totalDiurnas = 0, totalNocturnas = 0;
  document.querySelectorAll('#he-entries .he-entry').forEach(entry => {
    const inicio = entry.querySelector('[data-he="inicio"]').value;
    const fin = entry.querySelector('[data-he="fin"]').value;
    if (inicio && fin) {
      const {diurnas, nocturnas} = clasificarHoras(inicio, fin);
      totalDiurnas += diurnas;
      totalNocturnas += nocturnas;
    }
  });
  document.getElementById('he-diurnas-total').textContent = totalDiurnas;
  document.getElementById('he-nocturnas-total').textContent = totalNocturnas;
}

document.getElementById('btn-add-he').addEventListener('click', agregarEntradaHE);

document.getElementById('he-si').addEventListener('change', function() {
  if (this.checked) document.getElementById('horas-extras-box').classList.remove('hidden');
});
document.getElementById('he-no').addEventListener('change', function() {
  if (this.checked) document.getElementById('horas-extras-box').classList.add('hidden');
});

/* =========================================================
 * MODAL DE DÍAS FERIADOS
 * ========================================================= */
let feriadosSeleccionados = [];
const modalFeriados = document.getElementById('modal-feriados');
const feriadoYearSelect = document.getElementById('feriado-year');
const feriadosListEl = document.getElementById('feriados-list');

function cargarAniosFeriados() {
  const currentYear = new Date().getFullYear();
  feriadoYearSelect.innerHTML = '';
  for (let y = currentYear + 1; y >= currentYear - 3; y--) {
    const opt = document.createElement('option');
    opt.value = y; opt.textContent = y;
    feriadoYearSelect.appendChild(opt);
  }
}

function renderFeriados(year) {
  const feriados = getFeriados(year);
  feriadosListEl.innerHTML = '';
  feriados.forEach((f, idx) => {
    const key = `${year}-${toISO(f.fecha)}`;
    const isSelected = feriadosSeleccionados.some(s => s.key === key);
    const div = document.createElement('label');
    div.className = `feriado-item ${isSelected?'selected':''}`;
    const diasSemana = ['dom','lun','mar','mié','jue','vie','sáb'];
    const dw = diasSemana[f.fecha.getDay()];
    div.innerHTML = `
      <input type="checkbox" data-key="${key}" data-nombre="${f.nombre}" data-fecha="${toISO(f.fecha)}" ${isSelected?'checked':''}>
      <span class="fecha">${dw} ${f.fecha.getDate()}/${String(f.fecha.getMonth()+1).padStart(2,'0')}/${f.fecha.getFullYear()}</span>
      <span class="nombre">${f.nombre}</span>
      <span class="tipo">${f.tipo}</span>
    `;
    div.querySelector('input').addEventListener('change', function() {
      div.classList.toggle('selected', this.checked);
    });
    feriadosListEl.appendChild(div);
  });
}

feriadoYearSelect.addEventListener('change', () => renderFeriados(feriadoYearSelect.value));

document.getElementById('asueto-si').addEventListener('change', function() {
  if (this.checked) document.getElementById('asueto-box').classList.remove('hidden');
});
document.getElementById('asueto-no').addEventListener('change', function() {
  if (this.checked) document.getElementById('asueto-box').classList.add('hidden');
});

document.getElementById('btn-open-feriados').addEventListener('click', () => {
  cargarAniosFeriados();
  renderFeriados(feriadoYearSelect.value);
  modalFeriados.classList.add('active');
});

document.getElementById('btn-feriados-cancel').addEventListener('click', () => {
  modalFeriados.classList.remove('active');
});

document.getElementById('btn-feriados-ok').addEventListener('click', () => {
  feriadosSeleccionados = [];
  document.querySelectorAll('#feriados-list input[type="checkbox"]:checked').forEach(cb => {
    feriadosSeleccionados.push({ key:cb.dataset.key, nombre:cb.dataset.nombre, fecha:cb.dataset.fecha });
  });
  document.getElementById('dias-asueto-count').textContent = feriadosSeleccionados.length;
  const listEl = document.getElementById('dias-asueto-list');
  if (feriadosSeleccionados.length > 0) {
    listEl.innerHTML = feriadosSeleccionados.map(f => `• ${f.nombre} (${f.fecha})`).join('<br>');
  } else {
    listEl.textContent = '';
  }
  modalFeriados.classList.remove('active');
});

// Cerrar modal al hacer click fuera
modalFeriados.addEventListener('click', (e) => {
  if (e.target === modalFeriados) modalFeriados.classList.remove('active');
});

/* =========================================================
 * VACACIONES DEL PERÍODO
 * ========================================================= */
document.getElementById('vac-si').addEventListener('change', function() {
  if (this.checked) document.getElementById('vacaciones-box').classList.remove('hidden');
});
document.getElementById('vac-no').addEventListener('change', function() {
  if (this.checked) document.getElementById('vacaciones-box').classList.add('hidden');
});

document.getElementById('vacPeriodos').addEventListener('change', function() {
  document.getElementById('vac-periodo-2').classList.toggle('hidden', this.value !== '2');
});

/* =========================================================
 * INICIALIZACIÓN
 * ========================================================= */
validarFechas();
actualizarRenunciaUI();
actualizarPreavisoHint();

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.classList.remove('hidden');
  resultSection.classList.add('hidden');
  errorBox.scrollIntoView({behavior:'smooth',block:'center'});
}
function clearError() { errorBox.classList.add('hidden'); errorBox.textContent=''; }

function diasAguinaldoPorAntiguedad(anios) {
  if (anios < 3) return 15;
  if (anios <= 10) return 19;
  return 21;
}

/* ---------- Monto en letras ---------- */
const UNIDADES=['','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve','diez','once','doce','trece','catorce','quince','dieciséis','diecisiete','dieciocho','diecinueve','veinte'];
const DECENAS=['','','veinte','treinta','cuarenta','cincuenta','sesenta','setenta','ochenta','noventa'];
const CENTENAS=['','ciento','doscientos','trescientos','cuatrocientos','quinientos','seiscientos','setecientos','ochocientos','novecientos'];
function apocope(s){ if(s==='veintiuno')return'veintiún'; if(s.endsWith(' uno'))return s.slice(0,-3)+'un'; return s; }
function convertirGrupo(n){
  if(n===0)return''; if(n===100)return'cien'; let out='';
  const c=Math.floor(n/100),r=n%100;
  if(c>0)out+=CENTENAS[c]+' ';
  if(r>0){ if(r<=20)out+=UNIDADES[r]; else if(r<30)out+='veinti'+UNIDADES[r-20]; else{const d=Math.floor(r/10),u=r%10;out+=DECENAS[d];if(u>0)out+=' y '+UNIDADES[u];} }
  return out.trim();
}
function numeroALetras(num){
  num=Math.floor(num); if(num===0)return'cero'; let out='';
  const m=Math.floor(num/1000000),r1=num%1000000,mil=Math.floor(r1/1000),cien=r1%1000;
  if(m>0)out+=m===1?'un millón ':apocope(convertirGrupo(m))+' millones ';
  if(mil>0)out+=mil===1?'mil ':apocope(convertirGrupo(mil))+' mil ';
  if(cien>0)out+=convertirGrupo(cien);
  return out.trim();
}
function montoEnLetras(monto){
  const entero=Math.floor(monto+1e-9),cent=Math.round((monto-entero)*100);
  return `${numeroALetras(entero).toUpperCase()} ${String(cent).padStart(2,'0')}/100 DÓLARES DE LOS ESTADOS UNIDOS DE AMÉRICA`;
}

function calcularISR(rg){
  if(rg<=550)return 0;
  if(rg<=895.24)return 17.67+(rg-550)*0.10;
  if(rg<=2038.10)return 60+(rg-895.24)*0.20;
  return 288.57+(rg-2038.10)*0.30;
}
function textoTramoISR(base){
  if(base<=550)return 'tramo I (hasta $550.00) → exento';
  if(base<=895.24)return `tramo II: $17.67 + 10% × (${fmt.format(base)} − $550.00)`;
  if(base<=2038.10)return `tramo III: $60.00 + 20% × (${fmt.format(base)} − $895.24)`;
  return `tramo IV: $288.57 + 30% × (${fmt.format(base)} − $2,038.10)`;
}

/* =========================================================
 * SUBMIT — CÁLCULO PRINCIPAL
 * ========================================================= */
form.addEventListener('submit', (e) => {
  e.preventDefault();
  clearError();

  /* --- I. Datos básicos --- */
  const nombreTrabajador = document.getElementById('nombreTrabajador').value.trim();
  const patrono = document.getElementById('patrono').value.trim();
  const cargo = document.getElementById('cargo').value.trim();
  const fechaIngreso = fechaIngresoInput.value;
  const fechaTerminacion = fechaTerminacionInput.value;
  const salario = parseFloat(document.getElementById('salario').value);
  const causa = document.querySelector('input[name="causa"]:checked').value;

  /* --- Validaciones --- */
  if (!fechaIngreso) return showError('La fecha de ingreso es obligatoria.');
  if (!fechaTerminacion) return showError('La fecha de terminación es obligatoria.');
  if (!salario || salario <= 0) return showError('Ingresa un salario mensual mayor a $0.');

  const hoy = toISO(new Date());
  if (fechaIngreso > hoy) return showError('La fecha de ingreso no puede ser posterior a hoy.');
  if (causa === 'despido' && fechaTerminacion > hoy)
    return showError('Para despido injustificado, la fecha de terminación no puede ser posterior a hoy.');

  const antiguedad = diffFechas(fechaIngreso, fechaTerminacion);
  if (!antiguedad) return showError('La fecha de terminación debe ser posterior a la fecha de ingreso.');

  const anios = antiguedad.anios;
  const meses = antiguedad.meses;
  const diasExtra = antiguedad.dias;
  const fraccionAnio = (meses*30+diasExtra)/360;
  const antiguedadTotal = anios + fraccionAnio;

  /* --- Comisiones --- */
  const tieneComisiones = document.querySelector('input[name="tieneComisiones"]:checked').value === 'si';
  const comisionesMonto = tieneComisiones ? (parseFloat(document.getElementById('comisionesMonto').value)||0) : 0;

  /* --- Renuncia: validar notificación --- */
  let tipoEmpleado = 'comun', preavisoDias = 0, notificoRenuncia = false;
  if (causa === 'renuncia') {
    notificoRenuncia = document.querySelector('input[name="notificoRenuncia"]:checked')?.value === 'si';
    if (!notificoRenuncia) {
      return showError('No puede ejecutar el cálculo: debe notificar su renuncia por escrito al patrono dentro de los días establecidos (Ley 592, Art. 2).');
    }
    tipoEmpleado = tipoEmpleadoSelect.value;
    preavisoDias = Math.max(parseInt(preavisoDiasInput.value,10)||0, 0);
    const reqPreaviso = tipoEmpleado === 'gerente' ? 30 : 15;
    if (preavisoDias < reqPreaviso) {
      return showError(`No puede ejecutar el cálculo: el preaviso escrito debe ser de al menos ${reqPreaviso} días y solo se declararon ${preavisoDias} día(s) (Ley 592, Art. 2).`);
    }
  }

  /* --- Salario base --- */
  const salarioBase = salario + comisionesMonto;
  const SBD = salarioBase/30;
  const H = SBD/8;

  /* --- Vacación proporcional (solo período actual) --- */
  const vacacionPeriodo = SBD*15*1.3;
  const vacacionProporcional = vacacionPeriodo*fraccionAnio;

  /* --- Información de vacaciones tomadas --- */
  const tomoVacaciones = document.querySelector('input[name="tomoVacaciones"]:checked').value === 'si';
  let vacacionesInfo = 'No tomó vacaciones en el período actual';
  let vacDetalles = [];
  if (tomoVacaciones) {
    const numPeriodos = document.getElementById('vacPeriodos').value;
    const v1i = document.getElementById('vac1Inicio').value;
    const v1f = document.getElementById('vac1Fin').value;
    if (v1i && v1f) vacDetalles.push(`del ${fmtDate(v1i)} al ${fmtDate(v1f)}`);
    if (numPeriodos === '2') {
      const v2i = document.getElementById('vac2Inicio').value;
      const v2f = document.getElementById('vac2Fin').value;
      if (v2i && v2f) vacDetalles.push(`y del ${fmtDate(v2i)} al ${fmtDate(v2f)}`);
    }
    vacacionesInfo = `Tomadas en ${numPeriodos=== '1'?'un solo período (15 días)':'dos períodos (10 días en 2 intervalos)'} ${vacDetalles.join(' ')}`;
  }

  /* --- AGUINALDO (Reforma 2026: pago desde 1-oct) --- */
  const catAguTerm = diasAguinaldoPorAntiguedad(anios);
  let aguinaldo = 0;
  let aguinaldoRegla = '';
  let aguinaldoFraccion = 0;
  let aguinaldoBase = '';

  const termDate = new Date(fechaTerminacion+'T00:00:00');
  const oct1 = new Date(termDate.getFullYear(), 9, 1); // 1 de octubre

  if (termDate >= oct1) {
    // Terminación el 1-oct o posterior → aguinaldo COMPLETO
    if (anios >= 1) {
      aguinaldo = SBD * catAguTerm;
      aguinaldoRegla = 'COMPLETO — terminación el 1-oct o posterior (Reforma 2026)';
      aguinaldoFraccion = 1;
      aguinaldoBase = `Se paga completo: ${catAguTerm} días × ${fmt.format(SBD)}`;
    } else {
      // Menos de 1 año: proporcional por meses trabajados
      aguinaldoFraccion = Math.min(antiguedadTotal, 1);
      aguinaldo = SBD * catAguTerm * aguinaldoFraccion;
      aguinaldoRegla = 'PROPORCIONAL — menos de 1 año de servicio';
      aguinaldoBase = `Proporcional por antigüedad menor a 1 año`;
    }
  } else {
    // Terminación antes del 1-oct → PROPORCIONAL
    const D1 = dec12Reciente(fechaTerminacion);
    const D1ISO = toISO(D1);
    const startDate = fechaIngreso > D1ISO ? fechaIngreso : D1ISO;
    if (startDate < fechaTerminacion) {
      const dA = diffFechas(startDate, fechaTerminacion);
      aguinaldoFraccion = Math.min((dA.anios*360+dA.meses*30+dA.dias)/360, 1);
      aguinaldo = SBD * catAguTerm * aguinaldoFraccion;
      aguinaldoRegla = 'PROPORCIONAL — terminación antes del 1-oct';
      aguinaldoBase = `Desde el ${fmtDate(startDate)} hasta el ${fmtDate(fechaTerminacion)}`;
    } else {
      aguinaldoFraccion = fraccionAnio;
      aguinaldo = SBD * catAguTerm * fraccionAnio;
      aguinaldoRegla = 'PROPORCIONAL — aproximado';
      aguinaldoBase = 'Cálculo aproximado con fracción de antigüedad';
    }
  }

  /* --- Comisiones total --- */
  const totalComisiones = comisionesMonto*6;

  /* --- Indemnización / Prestación por renuncia --- */
  let montoCausa = 0, notaCausa = '', etiquetaCausa = '', legalCausa = '', exentoNota = '';
  const cumpleDosAnios = antiguedadTotal >= 2;

  if (causa === 'despido') {
    etiquetaCausa = 'Indemnización por despido injustificado';
    legalCausa = 'Art. 58 CT';
    exentoNota = 'indemnización y aguinaldo';
    montoCausa = salarioBase * anios + salarioBase * fraccionAnio;
    const minimo = SBD*15;
    if (montoCausa < minimo) montoCausa = minimo;
  } else {
    etiquetaCausa = 'Prestación económica por renuncia voluntaria';
    legalCausa = 'Ley 592 (2014), Arts. 2 y 4';
    exentoNota = 'prestación por renuncia y aguinaldo';
    const reqPreaviso = tipoEmpleado === 'gerente' ? 30 : 15;
    const cumplePreaviso = preavisoDias >= reqPreaviso;
    if (!cumpleDosAnios) {
      notaCausa = `No procede la prestación: la Ley 592 exige mínimo 2 años de servicio continuo y la antigüedad es de ${fmtFrac(antiguedadTotal)} años.`;
    } else if (!cumplePreaviso) {
      notaCausa = `No procede: el preaviso requerido es de ${reqPreaviso} días y solo se dieron ${preavisoDias}.`;
    } else {
      const baseRenuncia = SBD*15;
      montoCausa = baseRenuncia*anios + baseRenuncia*fraccionAnio;
    }
  }

  /* --- Horas extras (recolectar de entradas dinámicas) --- */
  let heDiurnas = 0, heNocturnas = 0;
  let heDetalles = [];
  document.querySelectorAll('#he-entries .he-entry').forEach(entry => {
    const fecha = entry.querySelector('[data-he="fecha"]').value;
    const inicio = entry.querySelector('[data-he="inicio"]').value;
    const fin = entry.querySelector('[data-he="fin"]').value;
    if (fecha && inicio && fin) {
      const {diurnas, nocturnas} = clasificarHoras(inicio, fin);
      heDiurnas += diurnas;
      heNocturnas += nocturnas;
      heDetalles.push(`${fecha}: ${inicio}–${fin} (${diurnas}h diurnas, ${nocturnas}h nocturnas)`);
    }
  });

  const subtotalHeDiurnas = H * heDiurnas * 2;
  const subtotalHeNocturnas = H * heNocturnas * 2 * 1.25;

  /* --- Días de asueto (de selección de feriados) --- */
  const diasAsueto = feriadosSeleccionados.length;
  const montoAsueto = SBD * 2 * diasAsueto;
  const asuetoDetalle = feriadosSeleccionados.map(f=>f.nombre).join(', ');

  /* --- Días de descanso --- */
  const diasDescanso = parseFloat(document.getElementById('diasDescanso').value)||0;
  const montoDescanso = SBD * 1.5 * diasDescanso;

  /* --- Total --- */
  const totalDevengado = vacacionProporcional + aguinaldo + totalComisiones +
    montoCausa + subtotalHeDiurnas + subtotalHeNocturnas + montoAsueto + montoDescanso;

  /* --- Deducciones --- */
  const montoExento = montoCausa + aguinaldo;
  const remuneracionGravada = totalDevengado - montoExento;
  const ISSS_RATE = 0.03, ISSS_TOPE = 1000, AFP_RATE = 0.0725;
  const baseISSS = Math.min(remuneracionGravada, ISSS_TOPE);
  const cotizacionISSS = baseISSS * ISSS_RATE;
  const cotizacionAFP = remuneracionGravada * AFP_RATE;
  const baseISR = Math.max(remuneracionGravada - cotizacionISSS - cotizacionAFP, 0);
  const retencionISR = calcularISR(baseISR);
  const totalDeducciones = cotizacionISSS + cotizacionAFP + retencionISR;
  const montoNeto = totalDevengado - totalDeducciones;

  /* =========================================================
   * Pintar resultado
   * ========================================================= */
  document.getElementById('r-nombreTrabajador').textContent = nombreTrabajador || '— No especificada —';
  document.getElementById('r-patrono').textContent = patrono || '— No especificado —';
  document.getElementById('r-cargo').textContent = cargo || '— No especificado —';
  document.getElementById('r-salario').textContent = fmt.format(salario);
  document.getElementById('r-fechaIngreso').textContent = fmtDate(fechaIngreso);
  document.getElementById('r-fechaTerminacion').textContent = fmtDate(fechaTerminacion);
  document.getElementById('r-antiguedad').textContent = diasExtra > 0
    ? `${anios} años, ${meses} meses, ${diasExtra} días` : `${anios} años, ${meses} meses`;
  document.getElementById('r-causaLabel2').textContent = causa==='despido'?'Despido sin causa justificada':'Renuncia voluntaria';
  document.getElementById('r-vacacionesInfo').textContent = vacacionesInfo;
  document.getElementById('r-aguinaldoInfo').textContent = aguinaldoRegla;
  document.getElementById('r-comisionesInfo').textContent = tieneComisiones&&comisionesMonto>0 ? `${fmt.format(comisionesMonto)}/mes` : 'Sin comisiones';
  document.getElementById('r-salarioBasePrestaciones').textContent = fmt.format(salarioBase);
  document.getElementById('r-heDiurnasInfo').textContent = `${heDiurnas} h`;
  document.getElementById('r-heNocturnasInfo').textContent = `${heNocturnas} h`;
  document.getElementById('r-asuetoInfo').textContent = diasAsueto > 0 ? `${diasAsueto} día(s)` : '0';
  document.getElementById('r-tipoEmpleado').textContent = causa==='renuncia'
    ? (tipoEmpleado==='gerente'?'Gerente — dirección/jefatura/especializado':'Común — demás trabajadores') : 'No aplica (despido)';
  document.getElementById('r-preaviso').textContent = causa==='renuncia'
    ? `Notificado: Sí. ${preavisoDias} día(s) de anticipación.` : 'No aplica (despido)';

  /* --- Desglose --- */
  document.getElementById('r-vacacion').textContent = fmt.format(vacacionProporcional);
  document.getElementById('r-aguinaldo').textContent = fmt.format(aguinaldo);
  document.getElementById('r-comisiones').textContent = tieneComisiones&&comisionesMonto>0 ? fmt.format(totalComisiones) : '$0.00';
  document.getElementById('r-causa-label').textContent = etiquetaCausa;
  document.getElementById('r-causa-legal').textContent = legalCausa;
  document.getElementById('r-causa').textContent = fmt.format(montoCausa);
  document.getElementById('r-heDiurnas').textContent = fmt.format(subtotalHeDiurnas);
  document.getElementById('r-heNocturnas').textContent = fmt.format(subtotalHeNocturnas);
  document.getElementById('r-asueto').textContent = fmt.format(montoAsueto);
  document.getElementById('r-descanso').textContent = fmt.format(montoDescanso);
  document.getElementById('r-total').textContent = fmt.format(totalDevengado);
  document.getElementById('r-nota').textContent = notaCausa;

  let notaBeneficios = '';
  notaBeneficios += `Vacaciones: ${vacacionesInfo}. `;
  notaBeneficios += `Aguinaldo: ${aguinaldoRegla} — ${aguinaldoBase}. `;
  if (tieneComisiones && comisionesMonto > 0) notaBeneficios += `Comisiones: ${fmt.format(totalComisiones)} (${fmt.format(comisionesMonto)} × 6 meses). `;
  if (diasAsueto > 0) notaBeneficios += `Días de asueto: ${diasAsueto} — ${asuetoDetalle}. `;
  if (heDetalles.length > 0) notaBeneficios += `Horas extras: ${heDetalles.join('; ')}.`;
  document.getElementById('r-nota-beneficios').textContent = notaBeneficios;

  /* --- Deducciones --- */
  document.getElementById('r-gravada').textContent = fmt.format(remuneracionGravada);
  document.getElementById('r-exento').textContent = fmt.format(montoExento);
  document.getElementById('r-exento-nota').textContent = exentoNota;
  document.getElementById('r-isss').textContent = fmt.format(cotizacionISSS);
  document.getElementById('r-afp').textContent = fmt.format(cotizacionAFP);
  document.getElementById('r-isr').textContent = fmt.format(retencionISR);
  document.getElementById('r-deducciones').textContent = fmt.format(totalDeducciones);
  document.getElementById('r-neto').textContent = fmt.format(montoNeto);
  document.getElementById('r-neto-letras').textContent = montoEnLetras(montoNeto);

  /* --- Declaración --- */
  document.getElementById('r-declaracion').textContent =
    `${nombreTrabajador||'La persona trabajadora'} declara haber recibido el detalle de las prestaciones económicas que anteceden, calculadas conforme al Código de Trabajo de El Salvador, así como el desglose de las retenciones de ley aplicadas y el monto neto resultante.`;

  const ahora = new Date();
  document.getElementById('r-generado').textContent =
    `Generado el ${ahora.toLocaleDateString('es-SV')} ${ahora.toLocaleTimeString('es-SV',{hour:'2-digit',minute:'2-digit'})}`;

  /* =========================================================
   * Metodología
   * ========================================================= */
  setTxt('m-comisiones-info', tieneComisiones?`Sí — ${fmt.format(comisionesMonto)}/mes promedio`:'No');
  setTxt('m-comisiones-detalle', tieneComisiones&&comisionesMonto>0
    ? `Promedio mensual de los últimos 6 meses: ${fmt.format(comisionesMonto)}. Total: ${fmt.format(totalComisiones)}.`
    : 'No se incluyen comisiones en el cálculo.');
  setTxt('m-salario-base-calc', `${fmt.format(salario)} + ${fmt.format(comisionesMonto)}`);
  setTxt('m-salario-base', fmt.format(salarioBase));
  setTxt('m-sbd-calc', fmt.format(salarioBase));
  setTxt('m-sbd', fmt.format(SBD));
  setTxt('m-h-calc', fmt.format(SBD));
  setTxt('m-h', fmt.format(H));
  setTxt('m-antiguedad', `${anios} año${anios===1?'':'s'}, ${meses} mes${meses===1?'':'s'}${diasExtra>0?` y ${diasExtra} día${diasExtra===1?'':'s'}`:''}`);
  setTxt('m-fraccion-calc', `(${meses} × 30 + ${diasExtra}) ÷ 360`);
  setTxt('m-fraccion', fmtFrac(fraccionAnio));
  setTxt('m-vac-calc', `${fmt.format(SBD)} × 15 × 1.30`);
  setTxt('m-fraccion2', fmtFrac(fraccionAnio));
  setTxt('m-vac', fmt.format(vacacionProporcional));
  setTxt('m-vac-nota-pago', vacacionesInfo);

  setTxt('m-agu-cat', `${catAguTerm} días (${anios<3?'cat. 1: <3 años':anios<=10?'cat. 2: 3-10 años':'cat. 3: >10 años'})`);
  setTxt('m-agu-regla', aguinaldoRegla);
  setTxt('m-agu-fraccion', fmtFrac(aguinaldoFraccion));
  setTxt('m-agu-fraccion2', fmtFrac(aguinaldoFraccion));
  setTxt('m-agu-calc', `${fmt.format(SBD)} × ${catAguTerm}`);
  setTxt('m-agu', fmt.format(aguinaldo));

  setTxt('m-com-calc', `${fmt.format(comisionesMonto)} × 6`);
  setTxt('m-com', tieneComisiones&&comisionesMonto>0 ? fmt.format(totalComisiones) : '$0.00');

  setTxt('m-causa-nombre', etiquetaCausa);
  setTxt('m-causa-legal', legalCausa);
  setTxt('m-causa-intro', causa==='despido'
    ? '30 días de salario por cada año de servicio y proporcionalmente por fracciones (Art. 58 CT).'
    : '15 días de salario básico por cada año de servicio, proporcionalmente por fracciones (Ley 592, Art. 4).');
  const renDL = document.getElementById('m-ren-dl');
  if (causa==='renuncia') {
    renDL.style.display='';
    renDL.innerHTML = `
      <dt>Tipo de empleado</dt><dd>${tipoEmpleado==='gerente'?'Gerente — dirección/jefatura/especializado':'Común'}</dd>
      <dt>Notificó al patrono</dt><dd>Sí</dd>
      <dt>Preaviso</dt><dd>${preavisoDias} día(s)</dd>
      <dt>Requisito 2 años</dt><dd>${cumpleDosAnios?'CUMPLE':'NO CUMPLE'} (${fmtFrac(antiguedadTotal)} años)</dd>`;
  } else {
    renDL.style.display='none';
    renDL.innerHTML='';
  }
  setTxt('m-causa-requisito', causa==='renuncia'&&!cumpleDosAnios ? 'No procede: mínimo 2 años no cumplido.' : '');
  setTxt('m-causa-calc', `${fmt.format(causa==='despido'?salarioBase:SBD*15)} × (${anios} + ${fmtFrac(fraccionAnio)})`);
  setTxt('m-causa-monto', fmt.format(montoCausa));

  setTxt('m-hed-calc', `${fmt.format(H)} × ${heDiurnas} × 2`);
  setTxt('m-hed', fmt.format(subtotalHeDiurnas));
  setTxt('m-hed-detalle', heDetalles.length>0 ? heDetalles.join('; ') : '');
  setTxt('m-hen-calc', `${fmt.format(H)} × ${heNocturnas} × 2 × 1.25`);
  setTxt('m-hen', fmt.format(subtotalHeNocturnas));
  setTxt('m-hen-detalle', '');
  setTxt('m-asu-calc', `${fmt.format(SBD)} × 2 × ${diasAsueto}`);
  setTxt('m-asu', fmt.format(montoAsueto));
  setTxt('m-asu-detalle', asuetoDetalle ? `Feriados trabajados: ${asuetoDetalle}` : '');
  setTxt('m-des-calc', `${fmt.format(SBD)} × 1.5 × ${diasDescanso}`);
  setTxt('m-des', fmt.format(montoDescanso));
  setTxt('m-total', fmt.format(totalDevengado));

  setTxt('m-exento', fmt.format(montoExento));
  setTxt('m-gravada', fmt.format(remuneracionGravada));
  setTxt('m-isss-base', fmt.format(baseISSS));
  setTxt('m-isss', fmt.format(cotizacionISSS));
  setTxt('m-afp-base', fmt.format(remuneracionGravada));
  setTxt('m-afp', fmt.format(cotizacionAFP));
  setTxt('m-isr-base', fmt.format(baseISR));
  setTxt('m-isr-tramo', textoTramoISR(baseISR));
  setTxt('m-isr', fmt.format(retencionISR));
  setTxt('m-neto-calc', `${fmt.format(totalDevengado)} − (${fmt.format(cotizacionISSS)} + ${fmt.format(cotizacionAFP)} + ${fmt.format(retencionISR)})`);
  setTxt('m-neto', fmt.format(montoNeto));

  resultSection.classList.remove('hidden');
  resultSection.scrollIntoView({behavior:'smooth',block:'start'});
});

document.getElementById('btn-print').addEventListener('click', () => window.print());
