/**
 * Calculadora de Liquidación Laboral — El Salvador
 * Código de Trabajo (Decreto N° 15, 1972), Ley 592 (2014),
 * Reforma Aguinaldo 23-sep-2026.
 *
 * CONVENCIONES:
 * - Mes comercial = 30 días; año comercial = 360 días; jornada = 8 horas.
 * - La antigüedad INCLUYE el último día laborado.
 * - Jornada diurna: 6:00 AM – 7:00 PM. Jornada nocturna: 7:00 PM – 6:00 AM.
 * - Art. 194 CT: si un día es asueto Y descanso, solo se paga el 100% de asueto.
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
 * SALARIO MÍNIMO — SECTOR COMERCIO (para tope Art. 58)
 * Decreto Ejec. N.º 11/12 (2025)
 * ========================================================= */
const SALARIO_MINIMO_COMERCIO = 408.80;
const TOPE_INDEMNIZACION = SALARIO_MINIMO_COMERCIO * 4; // $1,635.20

/* =========================================================
 * FERIADOS — Solo nacionales + San Miguel (21-nov)
 * Filtrados entre Fecha ingreso y Fecha terminación
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
  // SOLO feriados NACIONALES + San Miguel (21-nov)
  const fijos = [
    {mes:0, dia:1, nombre:'Año Nuevo', tipo:'Nacional'},
    {mes:4, dia:1, nombre:'Día del Trabajo', tipo:'Nacional'},
    {mes:4, dia:10, nombre:'Día de las Madres', tipo:'Nacional'},
    {mes:5, dia:17, nombre:'Día del Padre', tipo:'Nacional'},
    {mes:7, dia:6, nombre:'Divino Salvador del Mundo', tipo:'Nacional'},
    {mes:8, dia:15, nombre:'Independencia de El Salvador', tipo:'Nacional'},
    {mes:10, dia:2, nombre:'Día de los Difuntos', tipo:'Nacional'},
    {mes:10, dia:21, nombre:'Fiestas Patronales de San Miguel', tipo:'San Miguel'},
    {mes:11, dia:25, nombre:'Navidad', tipo:'Nacional'},
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
 * CLASIFICACIÓN DE HORAS (diurnas vs nocturnas)
 * Diurna: 6:00 AM (360 min) – 7:00 PM (1140 min)
 * Nocturna: 7:00 PM – 6:00 AM (día siguiente)
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
 * REFERENCIAS DOM
 * ========================================================= */
const fechaIngresoInput = document.getElementById('fechaIngreso');
const fechaTerminacionInput = document.getElementById('fechaTerminacion');
const aniosInput = document.getElementById('anios');
const mesesInput = document.getElementById('meses');
const mesesHint = document.getElementById('meses-hint');
const fechaTermHint = document.getElementById('fecha-term-hint');

/* =========================================================
 * VALIDACIÓN Y SINCRONIZACIÓN DE FECHAS
 * ========================================================= */
function validarFechas() {
  const causa = document.querySelector('input[name="causa"]:checked')?.value;
  const hoy = toISO(new Date());
  fechaIngresoInput.max = hoy;
  if (causa === 'despido') {
    fechaTerminacionInput.max = hoy;
    fechaTermHint.textContent = 'No puede ser posterior a hoy (despido).';
  } else {
    fechaTerminacionInput.removeAttribute('max');
    fechaTermHint.textContent = 'Puede seleccionar fechas futuras (renuncia).';
  }
  sincronizarAntiguedad();
  actualizarLimitesVacaciones();
}

function sincronizarAntiguedad() {
  const calc = diffFechas(fechaIngresoInput.value, fechaTerminacionInput.value);
  if (calc) {
    aniosInput.value = calc.anios;
    mesesInput.value = calc.meses;
    mesesHint.textContent = `${calc.anios} años, ${calc.meses} meses${calc.dias>0?` y ${calc.dias} días`:''}.`;
  } else {
    aniosInput.value = '';
    mesesInput.value = '';
    mesesHint.textContent = 'Complete ambas fechas.';
  }
  actualizarRenunciaHint();
}

fechaIngresoInput.addEventListener('change', validarFechas);
fechaTerminacionInput.addEventListener('change', validarFechas);

/* =========================================================
 * CAUSA: RENUNCIA
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
  document.getElementById('preaviso-hint').textContent = `Requeridos: ${req} días.`;
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
  let txt = '';
  if (total !== null) {
    const cumpleAnios = total >= 2;
    txt = `2 años — ${cumpleAnios?'✓':'✗'} (${total.toFixed(2)}); preaviso ${req}d — ${notifico?(cumplePre?'✓':'✗ ('+dias+'d)'):'✗ NO NOTIFICÓ'}.`;
  } else {
    txt = `Preaviso ${req}d — ${notifico?(cumplePre?'✓':'✗ ('+dias+'d)'):'✗ NO NOTIFICÓ'}.`;
  }
  hint.textContent = txt;
  const noCumple = (total!==null && total<2) || !notifico || !cumplePre;
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
 * HORAS EXTRAS
 * ========================================================= */
function agregarEntradaHE() {
  const container = document.getElementById('he-entries');
  const div = document.createElement('div');
  div.className = 'he-entry';
  div.innerHTML = `
    <div><label>Fecha</label><input type="date" data-he="fecha" required></div>
    <div><label>Hora inicio</label><input type="time" data-he="inicio" required></div>
    <div><label>Hora fin</label><input type="time" data-he="fin" required></div>
    <button type="button" class="he-remove">✕</button>
    <div class="he-result"></div>
  `;
  container.appendChild(div);

  const fechaInput = div.querySelector('[data-he="fecha"]');
  fechaInput.min = fechaIngresoInput.value;
  fechaInput.max = fechaTerminacionInput.value;

  div.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('change', () => actualizarEntradaHE(div));
  });
  div.querySelector('.he-remove').addEventListener('click', () => {
    div.remove();
    recalcularHE();
  });
}

function actualizarEntradaHE(div) {
  const fecha = div.querySelector('[data-he="fecha"]').value;
  const inicio = div.querySelector('[data-he="inicio"]').value;
  const fin = div.querySelector('[data-he="fin"]').value;
  const resultEl = div.querySelector('.he-result');
  resultEl.classList.remove('he-error');

  if (!fecha || !inicio || !fin) { resultEl.textContent = ''; return; }

  // Validar que esté dentro del rango
  if (fecha < fechaIngresoInput.value || fecha > fechaTerminacionInput.value) {
    resultEl.textContent = '⚠ La fecha debe estar dentro del rango de empleo.';
    resultEl.classList.add('he-error');
    return;
  }

  const {diurnas, nocturnas} = clasificarHoras(inicio, fin);
  resultEl.innerHTML = `→ <strong>${diurnas}</strong> h diurnas + <strong>${nocturnas}</strong> h nocturnas`;
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
 * MODAL DE FERIADOS
 * ========================================================= */
let feriadosSeleccionados = [];
const modalFeriados = document.getElementById('modal-feriados');
const feriadoYearSelect = document.getElementById('feriado-year');
const feriadosListEl = document.getElementById('feriados-list');

function cargarAniosFeriados() {
  const termYear = fechaTerminacionInput.value ? parseInt(fechaTerminacionInput.value.split('-')[0]) : new Date().getFullYear();
  feriadoYearSelect.innerHTML = '';
  // Mostrar el año de terminación y 1 año antes
  for (let y = termYear; y >= termYear - 1; y--) {
    const opt = document.createElement('option');
    opt.value = y; opt.textContent = y;
    if (y === termYear) opt.selected = true;
    feriadoYearSelect.appendChild(opt);
  }
}

function renderFeriados(year) {
  const feriados = getFeriados(year);
  const ingresoISO = fechaIngresoInput.value;
  const terminacionISO = fechaTerminacionInput.value;
  feriadosListEl.innerHTML = '';

  let visibles = 0;
  feriados.forEach((f) => {
    const fISO = toISO(f.fecha);
    // Filtrar: debe estar entre ingreso y terminación
    if (ingresoISO && fISO < ingresoISO) return;
    if (terminacionISO && fISO > terminacionISO) return;

    visibles++;
    const key = `${year}-${fISO}`;
    const isSelected = feriadosSeleccionados.some(s => s.key === key);
    const div = document.createElement('label');
    div.className = `feriado-item ${isSelected?'selected':''}`;
    const diasSemana = ['dom','lun','mar','mié','jue','vie','sáb'];
    const dw = diasSemana[f.fecha.getDay()];
    div.innerHTML = `
      <input type="checkbox" data-key="${key}" data-nombre="${f.nombre}" data-fecha="${fISO}" ${isSelected?'checked':''}>
      <span class="fecha">${dw} ${f.fecha.getDate()}/${String(f.fecha.getMonth()+1).padStart(2,'0')}/${f.fecha.getFullYear()}</span>
      <span class="nombre">${f.nombre}</span>
      <span class="tipo">${f.tipo}</span>
    `;
    div.querySelector('input').addEventListener('change', function() {
      div.classList.toggle('selected', this.checked);
    });
    feriadosListEl.appendChild(div);
  });

  if (visibles === 0) {
    feriadosListEl.innerHTML = '<p class="text-sm text-[var(--muted)] italic">No hay feriados dentro del rango de su empleo para este año.</p>';
  }
}

feriadoYearSelect.addEventListener('change', () => renderFeriados(feriadoYearSelect.value));

document.getElementById('asueto-si').addEventListener('change', function() {
  if (this.checked) document.getElementById('asueto-box').classList.remove('hidden');
});
document.getElementById('asueto-no').addEventListener('change', function() {
  if (this.checked) document.getElementById('asueto-box').classList.add('hidden');
});

document.getElementById('btn-open-feriados').addEventListener('click', () => {
  if (!fechaIngresoInput.value || !fechaTerminacionInput.value) {
    showError('Primero complete la Fecha de ingreso y la Fecha de terminación.');
    return;
  }
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
  listEl.innerHTML = feriadosSeleccionados.length > 0
    ? feriadosSeleccionados.map(f => `• ${f.nombre} (${f.fecha})`).join('<br>')
    : '';
  modalFeriados.classList.remove('active');
});

modalFeriados.addEventListener('click', (e) => {
  if (e.target === modalFeriados) modalFeriados.classList.remove('active');
});

/* =========================================================
 * VACACIONES — Autocálculo de fechas
 * 1 período: inicio + 14 días = 15 días total
 * 2 períodos: cada uno inicio + 4 días = 5 días cada uno
 * ========================================================= */
const vac1InicioInput = document.getElementById('vac1Inicio');
const vac1FinDisplay = document.getElementById('vac1FinDisplay');
const vac2InicioInput = document.getElementById('vac2Inicio');
const vac2FinDisplay = document.getElementById('vac2FinDisplay');

function actualizarLimitesVacaciones() {
  // Las vacaciones deben estar entre ingreso y terminación
  const min = fechaIngresoInput.value;
  const max = fechaTerminacionInput.value;
  [vac1InicioInput, vac2InicioInput].forEach(inp => {
    inp.min = min;
    inp.max = max;
  });
}

function autocalcularFinVacaciones() {
  const numPeriodos = document.getElementById('vacPeriodos').value;

  if (numPeriodos === '1') {
    document.getElementById('vac-periodo-2').classList.add('hidden');
    if (vac1InicioInput.value) {
      const inicio = new Date(vac1InicioInput.value+'T00:00:00');
      const fin = new Date(inicio);
      fin.setDate(fin.getDate() + 14); // +14 días = 15 días total
      const finISO = toISO(fin);
      if (finISO <= fechaTerminacionInput.value) {
        vac1FinDisplay.value = fmtDate(finISO);
        document.getElementById('vac1-dias-hint').textContent = '15 días continuos.';
      } else {
        vac1FinDisplay.value = '⚠ Excede la fecha de terminación';
        document.getElementById('vac1-dias-hint').textContent = 'La fecha de inicio es muy cercana a la terminación.';
      }
    } else {
      vac1FinDisplay.value = '';
      document.getElementById('vac1-dias-hint').textContent = '';
    }
  } else if (numPeriodos === '2') {
    document.getElementById('vac-periodo-2').classList.remove('hidden');
    if (vac1InicioInput.value) {
      const inicio = new Date(vac1InicioInput.value+'T00:00:00');
      const fin = new Date(inicio);
      fin.setDate(fin.getDate() + 4); // +4 días = 5 días total
      vac1FinDisplay.value = fmtDate(toISO(fin));
      document.getElementById('vac1-dias-hint').textContent = '5 días.';
    }
    if (vac2InicioInput.value) {
      const inicio = new Date(vac2InicioInput.value+'T00:00:00');
      const fin = new Date(inicio);
      fin.setDate(fin.getDate() + 4);
      vac2FinDisplay.value = fmtDate(toISO(fin));
      document.getElementById('vac2-dias-hint').textContent = '5 días.';
    }
  }
}

vac1InicioInput.addEventListener('change', autocalcularFinVacaciones);
vac2InicioInput.addEventListener('change', autocalcularFinVacaciones);
document.getElementById('vacPeriodos').addEventListener('change', autocalcularFinVacaciones);

document.getElementById('vac-si').addEventListener('change', function() {
  if (this.checked) document.getElementById('vacaciones-box').classList.remove('hidden');
});
document.getElementById('vac-no').addEventListener('change', function() {
  if (this.checked) document.getElementById('vacaciones-box').classList.add('hidden');
});

/* =========================================================
 * AGUINALDO — actualizar hint según fecha
 * ========================================================= */
function actualizarAguinaldoHint() {
  const termISO = fechaTerminacionInput.value;
  if (!termISO) return;
  const termDate = new Date(termISO+'T00:00:00');
  const oct1 = new Date(termDate.getFullYear(), 9, 1);
  const hint = document.getElementById('aguinaldo-hint');
  if (termDate >= oct1) {
    hint.innerHTML = 'Si no ha sido pagado: terminación el <strong>1-oct o posterior</strong> → aguinaldo <strong>COMPLETO</strong>.';
  } else {
    hint.innerHTML = 'Si no ha sido pagado: terminación <strong>antes del 1-oct</strong> → aguinaldo <strong>PROPORCIONAL</strong>.';
  }
}
fechaTerminacionInput.addEventListener('change', actualizarAguinaldoHint);

/* =========================================================
 * INICIALIZACIÓN
 * ========================================================= */
validarFechas();
actualizarRenunciaUI();
actualizarPreavisoHint();
actualizarAguinaldoHint();

/* =========================================================
 * UTILIDADES
 * ========================================================= */
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

/* Monto en letras */
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
  if(base<=550)return 'tramo I → exento';
  if(base<=895.24)return `tramo II: $17.67 + 10% × (${fmt.format(base)} − $550.00)`;
  if(base<=2038.10)return `tramo III: $60.00 + 20% × (${fmt.format(base)} − $895.24)`;
  return `tramo IV: $288.57 + 30% × (${fmt.format(base)} − $2,038.10)`;
}

/* =========================================================
 * VALIDACIÓN DE CAMPOS REQUERIDOS
 * ========================================================= */
function validarCamposCompletos() {
  const errores = [];

  // Fechas básicas
  if (!fechaIngresoInput.value) errores.push('La Fecha de ingreso es obligatoria.');
  if (!fechaTerminacionInput.value) errores.push('La Fecha de terminación es obligatoria.');

  const salario = parseFloat(document.getElementById('salario').value);
  if (!salario || salario <= 0) errores.push('El Ingreso mensual debe ser mayor a $0.');

  // Comisiones
  const tieneComisiones = document.querySelector('input[name="tieneComisiones"]:checked')?.value === 'si';
  if (tieneComisiones) {
    const monto = parseFloat(document.getElementById('comisionesMonto').value);
    if (isNaN(monto) || monto < 0) errores.push('Si tiene comisiones, debe ingresar el promedio mensual.');
  }

  // Renuncia
  const causa = document.querySelector('input[name="causa"]:checked')?.value;
  if (causa === 'renuncia') {
    const notifico = document.querySelector('input[name="notificoRenuncia"]:checked')?.value === 'si';
    if (!notifico) errores.push('Debe notificar su renuncia por escrito (Ley 592, Art. 2).');
    const preaviso = parseInt(preavisoDiasInput.value,10)||0;
    const req = tipoEmpleadoSelect.value === 'gerente' ? 30 : 15;
    if (preaviso < req) errores.push(`El preaviso debe ser de al menos ${req} días.`);
  }

  // Horas extras
  const tieneHE = document.querySelector('input[name="tieneHorasExtras"]:checked')?.value === 'si';
  if (tieneHE) {
    const entries = document.querySelectorAll('#he-entries .he-entry');
    if (entries.length === 0) {
      errores.push('Si trabajó horas extras, debe añadir al menos una entrada con fecha y horas.');
    } else {
      entries.forEach((entry, idx) => {
        const fecha = entry.querySelector('[data-he="fecha"]').value;
        const inicio = entry.querySelector('[data-he="inicio"]').value;
        const fin = entry.querySelector('[data-he="fin"]').value;
        if (!fecha || !inicio || !fin) {
          errores.push(`Horas extras — entrada ${idx+1}: complete fecha, hora inicio y hora fin.`);
        } else if (fecha < fechaIngresoInput.value || fecha > fechaTerminacionInput.value) {
          errores.push(`Horas extras — entrada ${idx+1}: la fecha debe estar entre el ingreso y la terminación.`);
        }
      });
    }
  }

  // Vacaciones
  const tomoVac = document.querySelector('input[name="tomoVacaciones"]:checked')?.value === 'si';
  if (tomoVac) {
    const vac1Inicio = vac1InicioInput.value;
    if (!vac1Inicio) errores.push('Si tomó vacaciones, ingrese la fecha de inicio del primer período.');
    else if (vac1Inicio < fechaIngresoInput.value || vac1Inicio > fechaTerminacionInput.value) {
      errores.push('La fecha de vacaciones debe estar entre el ingreso y la terminación.');
    }
    const numPeriodos = document.getElementById('vacPeriodos').value;
    if (numPeriodos === '2') {
      const vac2Inicio = vac2InicioInput.value;
      if (!vac2Inicio) errores.push('Si fueron 2 períodos, ingrese la fecha de inicio del segundo período.');
      else if (vac2Inicio < fechaIngresoInput.value || vac2Inicio > fechaTerminacionInput.value) {
        errores.push('La fecha del segundo período debe estar entre el ingreso y la terminación.');
      }
    }
  }

  // Feriados
  const trabajoAsueto = document.querySelector('input[name="trabajoAsueto"]:checked')?.value === 'si';
  if (trabajoAsueto && feriadosSeleccionados.length === 0) {
    errores.push('Si trabajó en días de asueto, seleccione al menos un feriado.');
  }

  return errores;
}

/* =========================================================
 * SUBMIT — CÁLCULO PRINCIPAL
 * ========================================================= */
form.addEventListener('submit', (e) => {
  e.preventDefault();
  clearError();

  /* --- VALIDACIÓN DE CAMPOS --- */
  const erroresValidacion = validarCamposCompletos();
  if (erroresValidacion.length > 0) {
    return showError(erroresValidacion.join('\n'));
  }

  /* --- I. Datos --- */
  const nombreTrabajador = document.getElementById('nombreTrabajador').value.trim();
  const patrono = document.getElementById('patrono').value.trim();
  const cargo = document.getElementById('cargo').value.trim();
  const fechaIngreso = fechaIngresoInput.value;
  const fechaTerminacion = fechaTerminacionInput.value;
  const salario = parseFloat(document.getElementById('salario').value);
  const causa = document.querySelector('input[name="causa"]:checked').value;

  const hoy = toISO(new Date());
  if (fechaIngreso > hoy) return showError('La fecha de ingreso no puede ser posterior a hoy.');
  if (causa === 'despido' && fechaTerminacion > hoy)
    return showError('Para despido, la terminación no puede ser futura.');

  const antiguedad = diffFechas(fechaIngreso, fechaTerminacion);
  if (!antiguedad) return showError('La terminación debe ser posterior al ingreso.');

  const anios = antiguedad.anios;
  const meses = antiguedad.meses;
  const diasExtra = antiguedad.dias;
  const fraccionAnio = (meses*30+diasExtra)/360;
  const antiguedadTotal = anios + fraccionAnio;

  /* --- Comisiones --- */
  const tieneComisiones = document.querySelector('input[name="tieneComisiones"]:checked').value === 'si';
  const comisionesMonto = tieneComisiones ? (parseFloat(document.getElementById('comisionesMonto').value)||0) : 0;

  /* --- Renuncia --- */
  let tipoEmpleado = 'comun', preavisoDias = 0;
  if (causa === 'renuncia') {
    tipoEmpleado = tipoEmpleadoSelect.value;
    preavisoDias = Math.max(parseInt(preavisoDiasInput.value,10)||0, 0);
  }

  /* --- Salario base --- */
  const salarioBase = salario + comisionesMonto;
  const SBD = salarioBase/30;
  const H = SBD/8;

  /* =========================================================
   * VACACIONES — Lógica completa
   * 
   * Casos:
   * A) NO tomó vacaciones → vacación proporcional completa por fracción de año
   * B) SÍ tomó y fueron PAGADAS → $0 (ya cubiertas)
   * C) SÍ tomó y NO fueron pagadas → se debe el período completo (15d × 1.3)
   * D) SÍ tomó PARCIALMENTE (ej. 10 de 15 días) → proporcional por días restantes
   * ========================================================= */
  const tomoVacaciones = document.querySelector('input[name="tomoVacaciones"]:checked').value === 'si';
  const vacacionesPagadas = tomoVacaciones ?
    (document.querySelector('input[name="vacacionesPagadas"]:checked')?.value === 'si') : false;

  const vacacionPeriodoCompleto = SBD * 15 * 1.3; // 15 días + 30%
  let vacacionProporcional = 0;
  let vacEstado = '', vacDetalle = '';

  if (!tomoVacaciones) {
    // Caso A: No tomó → proporcional completa
    vacacionProporcional = vacacionPeriodoCompleto * fraccionAnio;
    vacEstado = 'No gozadas';
    vacDetalle = `Vacación proporcional completa por fracción de año (${fmtFrac(fraccionAnio)}).`;
  } else {
    if (vacacionesPagadas) {
      // Caso B: Gozadas y pagadas → $0
      vacacionProporcional = 0;
      vacEstado = 'Gozadas y pagadas';
      vacDetalle = 'Ya fueron cubiertas por el patrono. No se debe pago adicional.';
    } else {
      // Caso C: Gozadas pero NO pagadas → deuda completa
      // (aunque las haya gozado, si no le pagaron, se le debe el período)
      vacacionProporcional = vacacionPeriodoCompleto;
      vacEstado = 'Gozadas sin pagar';
      vacDetalle = 'Las gozó pero el patrono no pagó la remuneración. Se debe el período completo (15d + 30%).';
    }
  }

  /* --- Información de vacaciones para el PDF --- */
  let vacacionesInfo = 'No tomó vacaciones en el período';
  if (tomoVacaciones) {
    const numPeriodos = document.getElementById('vacPeriodos').value;
    let fechas = [];
    if (vac1InicioInput.value) {
      fechas.push(`del ${fmtDate(vac1InicioInput.value)} al ${vac1FinDisplay.value}`);
    }
    if (numPeriodos === '2' && vac2InicioInput.value) {
      fechas.push(`y del ${fmtDate(vac2InicioInput.value)} al ${vac2FinDisplay.value}`);
    }
    vacacionesInfo = `Tomadas en ${numPeriodos==='1'?'un período (15 días)':'dos períodos (5+5 días)'} ${fechas.join(' ')}. ${vacacionesPagadas?'Pagadas.':'NO pagadas.'}`;
  }

  /* =========================================================
   * AGUINALDO — Lógica completa con Reforma 2026
   * 
   * Si ya fue PAGADO → $0
   * Si NO fue pagado:
   *   - Terminación ≥ 1-oct → COMPLETO (según categoría)
   *   - Terminación < 1-oct → PROPORCIONAL (desde 12-dic anterior)
   * ========================================================= */
  const aguinaldoPagado = document.querySelector('input[name="aguinaldoPagado"]:checked').value === 'si';
  const catAguTerm = diasAguinaldoPorAntiguedad(anios);
  let aguinaldo = 0;
  let aguinaldoRegla = '';
  let aguinaldoFraccion = 0;
  let aguinaldoEstado = '';

  if (aguinaldoPagado) {
    aguinaldo = 0;
    aguinaldoEstado = 'Ya fue pagado';
    aguinaldoRegla = 'No se incluye en la liquidación.';
    aguinaldoFraccion = 0;
  } else {
    const termDate = new Date(fechaTerminacion+'T00:00:00');
    const oct1 = new Date(termDate.getFullYear(), 9, 1);

    if (termDate >= oct1) {
      // COMPLETO
      if (anios >= 1) {
        aguinaldo = SBD * catAguTerm;
        aguinaldoFraccion = 1;
        aguinaldoEstado = 'No pagado — COMPLETO';
        aguinaldoRegla = `Terminación el 1-oct o posterior (Reforma 2026). ${catAguTerm} días completos.`;
      } else {
        // Menos de 1 año: proporcional
        aguinaldoFraccion = Math.min(antiguedadTotal, 1);
        aguinaldo = SBD * catAguTerm * aguinaldoFraccion;
        aguinaldoEstado = 'No pagado — PROPORCIONAL';
        aguinaldoRegla = `Menos de 1 año de servicio. Proporcional por ${fmtFrac(aguinaldoFraccion)}.`;
      }
    } else {
      // PROPORCIONAL
      const D1 = dec12Reciente(fechaTerminacion);
      const D1ISO = toISO(D1);
      const startDate = fechaIngreso > D1ISO ? fechaIngreso : D1ISO;
      if (startDate < fechaTerminacion) {
        const dA = diffFechas(startDate, fechaTerminacion);
        aguinaldoFraccion = Math.min((dA.anios*360+dA.meses*30+dA.dias)/360, 1);
        aguinaldo = SBD * catAguTerm * aguinaldoFraccion;
        aguinaldoEstado = 'No pagado — PROPORCIONAL';
        aguinaldoRegla = `Terminación antes del 1-oct. Desde ${fmtDate(startDate)}.`;
      } else {
        aguinaldoFraccion = fraccionAnio;
        aguinaldo = SBD * catAguTerm * fraccionAnio;
        aguinaldoEstado = 'No pagado — PROPORCIONAL';
        aguinaldoRegla = 'Cálculo con fracción de antigüedad.';
      }
    }
  }

  /* --- Comisiones total --- */
  const totalComisiones = comisionesMonto*6;

  /* =========================================================
   * INDEMNIZACIÓN / PRESTACIÓN POR RENUNCIA
   * Tope Art. 58 CT: 4 × salario mínimo sector comercio
   * Se usa el ÚLTIMO salario básico mensual pagado
   * ========================================================= */
  let montoCausa = 0, notaCausa = '', etiquetaCausa = '', legalCausa = '', exentoNota = '';
  let topeAplicado = false, baseIndemnizacion = 0, aplicaMinimo = false;
  const cumpleDosAnios = antiguedadTotal >= 2;

  if (causa === 'despido') {
    etiquetaCausa = 'Indemnización por despido injustificado';
    legalCausa = 'Art. 58 CT';
    exentoNota = 'indemnización y aguinaldo';

    // Aplicar tope de 4 salarios mínimos del sector comercio
    baseIndemnizacion = Math.min(salarioBase, TOPE_INDEMNIZACION);
    if (salarioBase > TOPE_INDEMNIZACION) {
      topeAplicado = true;
      notaCausa = `Tope legal aplicado: 4 × $${SALARIO_MINIMO_COMERCIO.toFixed(2)} = ${fmt.format(TOPE_INDEMNIZACION)} (Art. 58 CT, sector comercio). El salario base (${fmt.format(salarioBase)}) supera el tope.`;
    }

    montoCausa = baseIndemnizacion * anios + baseIndemnizacion * fraccionAnio;

    // Mínimo legal: 15 días de salario básico
    const minimo = SBD*15;
    if (montoCausa < minimo) {
      montoCausa = minimo;
      aplicaMinimo = true;
      notaCausa += ` Se elevó al mínimo legal de 15 días (${fmt.format(minimo)}).`;
    }
  } else {
    etiquetaCausa = 'Prestación económica por renuncia voluntaria';
    legalCausa = 'Ley 592 (2014), Arts. 2 y 4';
    exentoNota = 'prestación por renuncia y aguinaldo';
    const reqPreaviso = tipoEmpleado === 'gerente' ? 30 : 15;
    const cumplePreaviso = preavisoDias >= reqPreaviso;

    if (!cumpleDosAnios) {
      notaCausa = `No procede: mínimo 2 años no cumplido (${fmtFrac(antiguedadTotal)} años).`;
    } else if (!cumplePreaviso) {
      notaCausa = `No procede: preaviso de ${reqPreaviso} días requerido, solo ${preavisoDias} dados.`;
    } else {
      // Ley 592: 15 días de salario básico por año
      // Tope: 2 × salario mínimo del sector
      const TOPE_RENUNCIA = SALARIO_MINIMO_COMERCIO * 2;
      const baseRenuncia = Math.min(SBD * 15, TOPE_RENUNCIA / 30 * 15);
      montoCausa = baseRenuncia * anios + baseRenuncia * fraccionAnio;
      if (SBD * 15 > TOPE_RENUNCIA / 30 * 15) {
        notaCausa = `Tope Ley 592 (Art. 4): 2 × salario mínimo aplicado.`;
      }
    }
  }

  /* =========================================================
   * HORAS EXTRAS — Recolectar de entradas
   * ========================================================= */
  let heDiurnas = 0, heNocturnas = 0;
  let heDetalles = [];
  document.querySelectorAll('#he-entries .he-entry').forEach(entry => {
    const fecha = entry.querySelector('[data-he="fecha"]').value;
    const inicio = entry.querySelector('[data-he="inicio"]').value;
    const fin = entry.querySelector('[data-he="fin"]').value;
    if (fecha && inicio && fin && fecha >= fechaIngreso && fecha <= fechaTerminacion) {
      const {diurnas, nocturnas} = clasificarHoras(inicio, fin);
      heDiurnas += diurnas;
      heNocturnas += nocturnas;
      heDetalles.push(`${fecha}: ${inicio}–${fin} (${diurnas}h D, ${nocturnas}h N)`);
    }
  });

  const subtotalHeDiurnas = H * heDiurnas * 2;
  const subtotalHeNocturnas = H * heNocturnas * 2 * 1.25;

  /* =========================================================
   * DÍAS DE ASUETO Y DESCANSO
   * Art. 194 CT: si un día es asueto Y descanso, SOLO se paga el 100% de asueto
   * NO se suman 50% + 100%
   * ========================================================= */
  const diasAsueto = feriadosSeleccionados.length;
  const montoAsueto = SBD * 2 * diasAsueto; // 100% recargo = salario × 2
  const asuetoDetalle = feriadosSeleccionados.map(f=>f.nombre).join(', ');

  // Descanso semanal: solo días que NO son feriados
  // (los feriados ya se pagan con el 100%, no se acumula el 50%)
  const diasDescansoInput = parseFloat(document.getElementById('diasDescanso').value)||0;
  const montoDescanso = SBD * 1.5 * diasDescansoInput; // 50% recargo = salario × 1.5

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
   * PINTAR RESULTADO
   * ========================================================= */
  document.getElementById('r-nombreTrabajador').textContent = nombreTrabajador || '—';
  document.getElementById('r-patrono').textContent = patrono || '—';
  document.getElementById('r-cargo').textContent = cargo || '—';
  document.getElementById('r-salario').textContent = fmt.format(salario);
  document.getElementById('r-fechaIngreso').textContent = fmtDate(fechaIngreso);
  document.getElementById('r-fechaTerminacion').textContent = fmtDate(fechaTerminacion);
  document.getElementById('r-antiguedad').textContent = diasExtra > 0
    ? `${anios} años, ${meses} meses, ${diasExtra} días` : `${anios} años, ${meses} meses`;
  document.getElementById('r-causaLabel2').textContent = causa==='despido'?'Despido sin causa justificada':'Renuncia voluntaria';
  document.getElementById('r-vacacionesInfo').textContent = vacacionesInfo;
  document.getElementById('r-aguinaldoInfo').textContent = `${aguinaldoEstado} — ${aguinaldoRegla}`;
  document.getElementById('r-comisionesInfo').textContent = tieneComisiones&&comisionesMonto>0 ? `${fmt.format(comisionesMonto)}/mes` : 'Sin comisiones';
  document.getElementById('r-salarioBasePrestaciones').textContent = fmt.format(salarioBase);
  document.getElementById('r-heDiurnasInfo').textContent = `${heDiurnas} h`;
  document.getElementById('r-heNocturnasInfo').textContent = `${heNocturnas} h`;
  document.getElementById('r-asuetoInfo').textContent = diasAsueto > 0 ? `${diasAsueto} día(s)` : '0';
  document.getElementById('r-tipoEmpleado').textContent = causa==='renuncia'
    ? (tipoEmpleado==='gerente'?'Gerente/especializado':'Común') : 'No aplica (despido)';
  document.getElementById('r-preaviso').textContent = causa==='renuncia'
    ? `Notificado: Sí. ${preavisoDias} día(s).` : 'No aplica';

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
  notaBeneficios += `Vacaciones: ${vacEstado} — ${vacDetalle}. `;
  notaBeneficios += `Aguinaldo: ${aguinaldoEstado} — ${aguinaldoRegla}. `;
  if (tieneComisiones && comisionesMonto > 0) notaBeneficios += `Comisiones: ${fmt.format(totalComisiones)}. `;
  if (diasAsueto > 0) notaBeneficios += `Asuetos: ${diasAsueto} día(s) — ${asuetoDetalle}. `;
  if (diasDescansoInput > 0) notaBeneficios += `Descanso semanal: ${diasDescansoInput} día(s) (exclusivos, no feriados). `;
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
    `${nombreTrabajador||'La persona trabajadora'} declara haber recibido el detalle de las prestaciones económicas que anteceden, calculadas conforme al Código de Trabajo de El Salvador.`;

  const ahora = new Date();
  document.getElementById('r-generado').textContent =
    `Generado el ${ahora.toLocaleDateString('es-SV')} ${ahora.toLocaleTimeString('es-SV',{hour:'2-digit',minute:'2-digit'})}`;

  /* =========================================================
   * METODOLOGÍA
   * ========================================================= */
  setTxt('m-comisiones-info', tieneComisiones?`Sí — ${fmt.format(comisionesMonto)}/mes`:'No');
  setTxt('m-salario-base-calc', `${fmt.format(salario)} + ${fmt.format(comisionesMonto)}`);
  setTxt('m-salario-base', fmt.format(salarioBase));
  setTxt('m-sbd-calc', fmt.format(salarioBase));
  setTxt('m-sbd', fmt.format(SBD));
  setTxt('m-h-calc', fmt.format(SBD));
  setTxt('m-h', fmt.format(H));
  setTxt('m-antiguedad', `${anios} años, ${meses} meses${diasExtra>0?` y ${diasExtra} días`:''}`);
  setTxt('m-fraccion-calc', `(${meses} × 30 + ${diasExtra}) ÷ 360`);
  setTxt('m-fraccion', fmtFrac(fraccionAnio));

  // Vacaciones
  setTxt('m-vac-estado', vacEstado);
  setTxt('m-vac-detalle', vacDetalle);
  setTxt('m-vac-calc', `${fmt.format(SBD)} × 15 × 1.30`);
  setTxt('m-fraccion2', vacacionProporcional > 0 ? fmtFrac(fraccionAnio) : '0');
  setTxt('m-vac', fmt.format(vacacionProporcional));

  // Aguinaldo
  setTxt('m-agu-estado', aguinaldoEstado);
  setTxt('m-agu-regla', aguinaldoRegla);
  setTxt('m-agu-cat', `${catAguTerm} días (${anios<3?'cat. 1':anios<=10?'cat. 2':'cat. 3'})`);
  setTxt('m-agu-fraccion2', fmtFrac(aguinaldoFraccion));
  setTxt('m-agu-calc', `${fmt.format(SBD)} × ${catAguTerm}`);
  setTxt('m-agu', fmt.format(aguinaldo));

  // Comisiones
  setTxt('m-com-calc', `${fmt.format(comisionesMonto)} × 6`);
  setTxt('m-com', tieneComisiones&&comisionesMonto>0 ? fmt.format(totalComisiones) : '$0.00');

  // Causa
  setTxt('m-causa-nombre', etiquetaCausa);
  setTxt('m-causa-legal', legalCausa);
  const renDL = document.getElementById('m-ren-dl');
  if (causa==='renuncia') {
    renDL.style.display='';
    renDL.innerHTML = `
      <dt>Tipo</dt><dd>${tipoEmpleado==='gerente'?'Gerente':'Común'}</dd>
      <dt>Preaviso</dt><dd>${preavisoDias} día(s)</dd>
      <dt>2 años</dt><dd>${cumpleDosAnios?'✓':'✗'} (${fmtFrac(antiguedadTotal)})</dd>`;
  } else {
    renDL.style.display='none';
    renDL.innerHTML='';
  }
  setTxt('m-causa-requisito', causa==='renuncia'&&!cumpleDosAnios ? 'No procede.' : '');
  let topeTxt = '';
  if (causa === 'despido') {
    topeTxt = `Tope Art. 58 CT: 4 × $${SALARIO_MINIMO_COMERCIO.toFixed(2)} = ${fmt.format(TOPE_INDEMNIZACION)}. `;
    topeTxt += topeAplicado ? `Aplicado (salario ${fmt.format(salarioBase)} > tope).` : 'No aplicado.';
  }
  setTxt('m-causa-tope', topeTxt);
  setTxt('m-causa-calc', `${fmt.format(baseIndemnizacion || SBD*15)} × (${anios} + ${fmtFrac(fraccionAnio)})`);
  setTxt('m-causa-monto', fmt.format(montoCausa));
  setTxt('m-causa-minimo', aplicaMinimo ? `Elevado al mínimo legal de 15 días.` : '');

  // Jornadas
  setTxt('m-hed-calc', `${fmt.format(H)} × ${heDiurnas} × 2`);
  setTxt('m-hed', fmt.format(subtotalHeDiurnas));
  setTxt('m-hen-calc', `${fmt.format(H)} × ${heNocturnas} × 2 × 1.25`);
  setTxt('m-hen', fmt.format(subtotalHeNocturnas));
  setTxt('m-asu-calc', `${fmt.format(SBD)} × 2 × ${diasAsueto}`);
  setTxt('m-asu', fmt.format(montoAsueto));
  setTxt('m-des-calc', `${fmt.format(SBD)} × 1.5 × ${diasDescansoInput}`);
  setTxt('m-des', fmt.format(montoDescanso));
  setTxt('m-total', fmt.format(totalDevengado));

  // Deducciones
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
