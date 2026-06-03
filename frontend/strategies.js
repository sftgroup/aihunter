function loadStrategiesPanel() {
  loadStrategyList();
  loadCapitalSliders();
  loadLendingRates();
  loadLendingPositions();
}

function loadStrategyList() {
  var xhr = new XMLHttpRequest();
  xhr.open("GET", API + "/strategies", true);
  xhr.onload = function() {
    try {
      var d = JSON.parse(xhr.responseText);
      var strategies = d.data || [];
      var types = ['SNIPER', 'ARBITRAGE', 'MATURE_MEME', 'LENDING_ARB'];
      var icons = {'SNIPER':'🎯', 'ARBITRAGE':'⚡', 'MATURE_MEME':'🐸', 'LENDING_ARB':'🏦'};
      var descs = {'SNIPER':'新开盘土狗狙击', 'ARBITRAGE':'跨池DEX套利', 'MATURE_MEME':'成熟土狗波段', 'LENDING_ARB':'DeFi借贷/闪贷套利'};
      
      var html = '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px">';
      for (var i = 0; i < types.length; i++) {
        var t = types[i];
        var cfg = {enabled: true, capital_ratio: 0.25, hf_threshold: 1.5, is_atomic: false};
        for (var j = 0; j < strategies.length; j++) {
          if (strategies[j].strategy_type === t) { cfg = strategies[j]; break; }
        }
        var atomicBadge = cfg.is_atomic ? '<span class="flag flag-warn" style="font-size:0.65rem">⚡原子交易</span>' : '';
        var hfHtml = (t === 'LENDING_ARB') ? '<div style="margin-top:4px;font-size:0.75rem;color:var(--text2)">HF阈值: ' + (cfg.hf_threshold || 1.5).toFixed(1) + '</div>' : '';
        html += '<div class="card" style="padding:12px">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
        html += '<div><b>' + icons[t] + ' ' + t + '</b> ' + atomicBadge + '</div>';
        html += '<label class="switch"><input type="checkbox" ' + (cfg.enabled ? 'checked' : '') + ' onchange="toggleStrategy(\'' + t + '\', this.checked)"><span class="slider"></span></label>';
        html += '</div>';
        html += '<div style="font-size:0.8rem;color:var(--text2);margin-bottom:4px">' + descs[t] + '</div>';
        html += '<div style="font-size:0.8rem">资金比例: <b>' + ((cfg.capital_ratio || 0.25) * 100).toFixed(0) + '%</b></div>';
        html += hfHtml;
        html += '</div>';
      }
      html += '</div>';
      document.getElementById("strategyList").innerHTML = html;
    } catch(e) {
      document.getElementById("strategyList").innerHTML = '<div class="empty"><p>加载失败</p></div>';
    }
  };
  xhr.send();
}

function toggleStrategy(type, enabled) {
  var xhr = new XMLHttpRequest();
  xhr.open("POST", API + "/strategies", true);
  xhr.setRequestHeader("Content-Type", "application/json");
  xhr.send(JSON.stringify({strategy_type: type, enabled: enabled}));
}

function loadCapitalSliders() {
  var xhr = new XMLHttpRequest();
  xhr.open("GET", API + "/strategies", true);
  xhr.onload = function() {
    try {
      var d = JSON.parse(xhr.responseText);
      var strategies = d.data || [];
      var types = ['SNIPER', 'ARBITRAGE', 'MATURE_MEME', 'LENDING_ARB'];
      var icons = {'SNIPER':'🎯', 'ARBITRAGE':'⚡', 'MATURE_MEME':'🐸', 'LENDING_ARB':'🏦'};
      
      var html = '';
      var total = 0;
      for (var i = 0; i < types.length; i++) {
        var t = types[i];
        var ratio = 0.25;
        for (var j = 0; j < strategies.length; j++) {
          if (strategies[j].strategy_type === t) { ratio = parseFloat(strategies[j].capital_ratio) || 0.25; break; }
        }
        total += ratio;
        html += '<div><div style="display:flex;justify-content:space-between;font-size:0.8rem;margin-bottom:2px">';
        html += '<span>' + icons[t] + ' ' + t + '</span>';
        html += '<span id="capVal_' + t + '">' + (ratio * 100).toFixed(0) + '%</span></div>';
        html += '<input type="range" id="cap_' + t + '" min="0" max="100" value="' + (ratio * 100).toFixed(0) + '" oninput="updateCapSlider('' + t + '')" style="width:100%"></div>';
      }
      document.getElementById("capitalSliders").innerHTML = html;
      document.getElementById("capitalTotal").textContent = (total * 100).toFixed(0) + '%';
    } catch(e) {}
  };
  xhr.send();
}

function updateCapSlider(type) {
  var val = parseInt(document.getElementById("cap_" + type).value);
  document.getElementById("capVal_" + type).textContent = val + '%';
}

function saveCapitalAllocation() {
  var types = ['SNIPER', 'ARBITRAGE', 'MATURE_MEME', 'LENDING_ARB'];
  var promises = [];
  for (var i = 0; i < types.length; i++) {
    var t = types[i];
    var val = parseInt(document.getElementById("cap_" + t).value) / 100;
    var xhr = new XMLHttpRequest();
    xhr.open("POST", API + "/strategies", false);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.send(JSON.stringify({strategy_type: t, capital_ratio: val}));
  }
  document.getElementById("capitalResult").textContent = '✅ 已保存';
  document.getElementById("capitalResult").style.color = 'var(--accent)';
  setTimeout(function() { document.getElementById("capitalResult").textContent = ''; }, 2000);
}

function loadLendingRates() {
  var xhr = new XMLHttpRequest();
  xhr.open("GET", API + "/lending/rates", true);
  xhr.onload = function() {
    try {
      var d = JSON.parse(xhr.responseText);
      var rates = d.data || [];
      if (rates.length === 0) {
        document.getElementById("lendingRatesList").innerHTML = '<div class="empty"><p>暂无利率数据，等待采集...</p></div>';
        return;
      }
      var html = '<div style="overflow-x:auto"><table><tr><th>链</th><th>协议</th><th>代币</th><th>存款APY</th><th>借款APY</th><th>利差(bps)</th><th>时间</th></tr>';
      for (var i = 0; i < rates.length; i++) {
        var r = rates[i];
        var spread = ((r.borrow_apy || 0) - (r.supply_apy || 0)) * 100;
        html += '<tr><td>' + r.chain + '</td><td>' + r.protocol + '</td><td>' + r.token + '</td>';
        html += '<td class="green">' + (r.supply_apy || 0).toFixed(2) + '%</td>';
        html += '<td class="' + (spread > 0 ? 'red' : 'green') + '">' + (r.borrow_apy || 0).toFixed(2) + '%</td>';
        html += '<td>' + spread.toFixed(0) + '</td>';
        html += '<td style="font-size:0.7rem">' + (r.recorded_at ? new Date(r.recorded_at).toLocaleTimeString() : '-') + '</td></tr>';
      }
      html += '</table></div>';
      document.getElementById("lendingRatesList").innerHTML = html;
    } catch(e) {
      document.getElementById("lendingRatesList").innerHTML = '<div class="empty"><p>加载失败</p></div>';
    }
  };
  xhr.send();
}

function loadLendingPositions() {
  var xhr = new XMLHttpRequest();
  xhr.open("GET", API + "/lending/positions", true);
  xhr.onload = function() {
    try {
      var d = JSON.parse(xhr.responseText);
      var positions = d.data || [];
      if (positions.length === 0) {
        document.getElementById("lendingPositionsList").innerHTML = '<div class="empty"><p>暂无活跃借贷仓位</p></div>';
        return;
      }
      var html = '<div style="overflow-x:auto"><table><tr><th>链</th><th>协议</th><th>抵押</th><th>债务</th><th>HF</th><th>清算价</th></tr>';
      for (var i = 0; i < positions.length; i++) {
        var p = positions[i];
        var hfClass = parseFloat(p.current_hf) > 1.8 ? 'green' : (parseFloat(p.current_hf) > 1.5 ? 'warn' : 'red');
        html += '<tr><td>' + p.chain + '</td><td>' + p.protocol + '</td>';
        html += '<td>' + (p.collateral_token || '').slice(0,8) + '</td>';
        html += '<td>' + (p.debt_token || '').slice(0,8) + '</td>';
        html += '<td class="' + hfClass + '">' + parseFloat(p.current_hf).toFixed(2) + '</td>';
        html += '<td>' + (p.liquidation_price ? '$' + parseFloat(p.liquidation_price).toFixed(2) : '-') + '</td></tr>';
      }
      html += '</table></div>';
      document.getElementById("lendingPositionsList").innerHTML = html;
    } catch(e) {
      document.getElementById("lendingPositionsList").innerHTML = '<div class="empty"><p>加载失败</p></div>';
    }
  };
  xhr.send();
}

