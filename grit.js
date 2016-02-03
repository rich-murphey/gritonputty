var curHistory = [];

var now = function() {
  return (new Date()).getTime();
}

var pickOne = function(letters, weights, e) {
  e = e || 1
  var totalWeight = 0;
  for(var i = 0; i < letters.length; i++)
    totalWeight += Math.pow(weights[i], e);

  var r = Math.random() * totalWeight;
  var w = 0;
  for(var i = 0; i < letters.length; i++) {
    w += Math.pow(weights[i], e);
    if(w > r) break;
  }
  if(i == letters.length)
    console.log("Failed to pick letter from", letters, "according to", weights);
  return letters[i];
}

var letterOverThreshold = function(letter) {
  if(state.accuracy[letter] < state.unlock.accuracy)
    return false;
  if(state.speed[letter] < state.unlock.speed)
    return false;
  if(state.counts[letter] < state.unlock.counts)
    return false;
  return true;
}

var colorThresholds = function() {
  var thresholds = ["accuracy", "speed", "counts"];
  for(t in thresholds) {
    var threshold = thresholds[t];
    for(l in state[threshold]) {
      var elem = document.querySelector("[data-state-path=" + threshold + "-" + l);
      if(!elem) continue;
      if(!state.counts[l]) continue;
      if(state[threshold][l] < state.unlock[threshold])
        elem.classList.add("low-stat");
      else
        elem.classList.remove("low-stat");
    }
  }
}

var generateTargets = function(letters) {
  var targets = [];
  var totalTargets = {};

  state.counts = state.counts || {};
  state.accuracy = state.accuracy || {};
  state.speed = state.speed || {};

  weights = state.targetTypeWeights;
  weights = weights || { counts: 1, accuracy: 1, speed: 1, threshold: 1 };

  for(var i = 0; i < letters.length; i++) {
    var l = letters[i];
    targets[i] = {
      counts: 1 / (1 + Math.sqrt(state.counts[l] || 0)),
      accuracy: (1 - (state.accuracy[l] || 0)*(state.accuracy[l] || 0)),
      speed: 1 / (1 + Math.sqrt(state.speed[l] || 0)),
      threshold: letterOverThreshold(l) ? 0 : 1,
    }
    for(var w in targets[i])
      totalTargets[w] = (totalTargets[w] || 0) + targets[i][w];
  }

  mixedTargets = [];
  for(var i = 0; i < letters.length; i++) {
    mixedTargets[i] = 0;
    for(w in targets[i])
      if(totalTargets[w])
        mixedTargets[i] += weights[w] * targets[i][w] / (totalTargets[w] || 1);
  }

  return mixedTargets;
}

var generateWeights = function(letters, targets, prefix, suffix, start) {
  var weights = [];
  var whichtable = start ? "firsts" : "freqs";
  var ngramLength = prefix ? prefix.length + 1 : suffix.length + 1
  if(ngramLength > 3)
    ngramLength = 3;
  var table = stats[ngramLength][whichtable];

  if(prefix)
    prefix = prefix.substr(-2);
  else
    suffix = suffix.substr(0, 2);

  for(var i = 0; i < letters.length; i++) {
    var l = letters[i];
    var ngram = prefix ? prefix + l : l + suffix;
    weights[i] = (table[ngram] || 0) * Math.sqrt(targets[i]);
  }

  return weights;
};

var generateWord = function(wordLen) {
  var letters = state.letters;
  var weights = [];

  var targets = generateTargets(letters);

  var totalTargets = 0;
  state.targets = {};
  for(var i = 0; i < letters.length; i++)
    totalTargets += targets[i];
  for(var i = 0; i < letters.length; i++)
    state.targets[letters[i]] = targets[i] / totalTargets;
  state.setArray("targets", "0");

  var word = pickOne(letters, targets, state.targetTypeWeights.pivotExponent);
  var pivotPos = Math.floor(Math.random() * wordLen);

  for(var l = pivotPos - 1; l >= 0; l--) {
    weights = generateWeights(letters, targets, null, word, l == 0);
    letter = pickOne(letters, weights);

    if(letter)
      word = letter + word;
  }

  for(var l = pivotPos + 1; l < wordLen; l++) {
    weights = generateWeights(letters, targets, word, null, l < 3);
    letter = pickOne(letters, weights);

    if(letter)
      word += letter;
  }

  if(word.length < wordLen)
    console.log("word is too short: ", word);

  return word;
}

var generateSentence = function(length) {
  var sentence = "";
  for(var i = 0; i < length; i++) {
    sentence += generateWord(3 + Math.floor(Math.random() * 4));
    if(sentence.length > length)
      break;
    sentence += " ";
  }
  if(sentence.length < length)
    console.log("sentence is too short: ", sentence);
  return sentence;
}

var collectStats = function() {
  var correct = {}
  var incorrect = {}
  var speed = {}
  var lastTime = curHistory[0][0];
  for(var i = 0; i < curHistory.length; i++) {
    var entry = curHistory[i];
    if(entry[1] == entry[2]) { // correct press
      for(var c = 0; c < entry[1].length; c++) {
        var ch = entry[1][c];
        correct[ch] = correct[ch] || 0;
        correct[ch]++;
        if(i > 0) { // No speed for the first character
          speed[ch] = speed[ch] || []
          // Split chord timing equally over its letters
          var charTime = (entry[0] - lastTime) / entry[1].length;
          // (60 seconds/minute) / (5 character/word) * (1000 ms/s) / (ms/char) = words/minute
          speed[ch].push(60 / 5 * 1000 / charTime);
        }
      }
      lastTime = entry[0];
    } else { // incorrect press
      for(var c = 0; c < entry[1].length; c++) {
        var ch = entry[1][c];
        incorrect[ch] = incorrect[ch] || 0;
        incorrect[ch]++;
      }
    }
  }

  state.accuracy = state.accuracy || {}
  state.speed = state.speed || {}
  state.counts = state.counts || {}
  for(c in correct) {
    state.counts[c] = state.counts[c] || 0;

    var newWeight = state.weight.sentence + (1-Math.pow(1-state.weight.letter, correct[c]));
    var letterFraction = correct[c] / (state.counts[c] + correct[c]);
    if(newWeight < letterFraction)
      newWeight = letterFraction;
    var oldWeight = 1 - newWeight;

    var accuracy = correct[c] / (correct[c] + (incorrect[c] || 0));
    state.accuracy[c] = state.accuracy[c] || 0;
    state.accuracy[c] = state.accuracy[c] * oldWeight + newWeight * accuracy;

    if(speed[c]) {
      var s = 0;
      for(var i = 0; i < speed[c].length; i++)
        s += speed[c][i];
      s /= speed[c].length;
      state.speed[c] = state.speed[c] || 0;
      state.speed[c] = state.speed[c] * oldWeight + newWeight * s;
    }

    state.counts[c] += correct[c];
  }
  state.setArray("accuracy");
  state.setArray("speed");
  state.setArray("counts");
  colorThresholds();
}

var checkAddNewLetter = function() {
  for(var i = 0; i < state.letters.length; i++)
    if(!letterOverThreshold(state.letters[i]))
      return false;

  var letters = Object.keys(stats[1].freqs);
  letters = letters.sort(function(a,b) { return stats[1].freqs[a] < stats[1].freqs[b]})
  for(var i = 0; i < letters.length; i++)
    if(state.letters.indexOf(letters[i]) == -1) {
      // TODO: this is hacky.
      state.updateString({ target:
        document.querySelector("[data-state-path=letters][data-state-char=" + letters[i] + "]")});
      break;
    }

  return true;
}

var checkLetter = function(event) {
  if(document.querySelector(":focus")) return;
  var active = document.querySelector("#words .active");
  if(!active && event.keyCode != 13)
    return;
  if(event.keyCode == 8) { // backspace
    var prev = active.previousSibling;
    if(prev) {
      active.classList.remove("active");
      prev.classList.add("active");
    }
    return;
  }
  if(event.keyCode == 13) { // return
    if(active == null)
      makeSentence();
    return;
  }
  var wrongLetter = document.getElementById("wrong-letter");

  var lastHistory = curHistory[curHistory.length - 1];
  var chord = lastHistory && event.timeStamp - lastHistory[0] < state.chordThreshold;
  var keyCorrect = event.charCode == active.innerHTML.charCodeAt(0);
  var chordWrong = chord && lastHistory[1] != lastHistory[2];
  if(chord)
    console.log("chord:", lastHistory[2] + String.fromCharCode(event.charCode), " in ",
        event.timeStamp - lastHistory[0], "ms");
  var bad = active;
  var finished = false;

  if(keyCorrect && !chordWrong) { // A good keystroke, whether in a chord or not
    active.classList.remove("active");
    var next = active.nextSibling;
    if(next)
      next.classList.add("active");
    else
      finished = true;
  } else if(!keyCorrect && !chordWrong) { // The first wrong keystroke of a chord
    var chordLen = chord ? lastHistory[1].length + 1 : 1;
    active.classList.remove("active");
    active.classList.add("error");
    for(var i = 1; i < chordLen; i++) {
      active = active.previousSibling;
      active.classList.add("error");
    }
    active.classList.add("active");
  } else { // a continuation of a wrong chord
    if(chord)
      for(var i = 0; i < lastHistory[1].length; i++)
        bad = bad.nextSibling;
    bad.classList.add("error");
  }

  if(chord) {
    lastHistory[1] += bad.innerHTML;
    lastHistory[2] += String.fromCharCode(event.charCode);
  } else {
    curHistory.push([event.timeStamp, active.innerHTML, String.fromCharCode(event.charCode)]);
    lastHistory = curHistory[curHistory.length - 1];
  }

  if(lastHistory[1] != lastHistory[2])
    wrongLetter.innerHTML = lastHistory[2];
  else
    wrongLetter.innerHTML = "";

  if(finished) {
    document.querySelector("#words").classList.add("finished");
    collectStats();
    checkAddNewLetter();
  }

  return true;
}

var makeSentence = function(event) {
  var words = document.querySelector("#words");
  words.classList.remove("finished");
  var sentence = generateSentence(state["sentenceLength"]);
  colorThresholds();
  var spans = [];
  words.innerHTML = "";
  for(var i = 0; i < sentence.length; i++) {
    var s = document.createElement("span");
    s.innerHTML = sentence[i];
    spans.push(s);
    words.appendChild(s);
  }
  spans[0].classList.add("active");
  curHistory = [];
};

var createDataType = function(clas, type, path, def) {
  var div = document.createElement("div");
  div.classList.add(clas);
  div.setAttribute("data-state-type", type);
  div.setAttribute("data-state-path", path);
  div.setAttribute("data-state-default", def);
  div.innerHTML = def;
  return div;
}

var generatePage = function() {
  var inputs = document.querySelectorAll("input[data-state-type]");
  for(var i = 0; i < inputs.length; i++)
    if(!inputs[i].getAttribute("data-state-default"))
       inputs[i].setAttribute("data-state-default", inputs[i].value);


  var lettersDiv = document.getElementById("letters");

  var letters = Object.keys(stats[1].freqs);
  letters = letters.sort(function(a,b) { return stats[1].freqs[a] < stats[1].freqs[b]})
  for(var i = 0; i < letters.length; i++) {
    var letter = letters[i];

    var container = document.createElement("div");

    var div = document.createElement("div");
    div.classList.add("letter-enable");
    div.setAttribute("data-state-type", "char-array");
    div.setAttribute("data-state-path", "letters");
    div.setAttribute("data-state-char", letter);
    div.innerHTML = letter;
    container.appendChild(div);

    container.appendChild(createDataType("letter-accuracy", "percentage", "accuracy-" + letter, "0"));
    container.appendChild(createDataType("letter-speed", "int", "speed-" + letter, "0"));
    container.appendChild(createDataType("letter-counts", "log", "counts-" + letter, "0"));
    container.appendChild(createDataType("letter-targets", "percentage", "targets-" + letter, "0"));

    lettersDiv.appendChild(container);
  }


  document.addEventListener("keypress", checkLetter);
}

var reset = function() {
  state.reset();
  makeSentence();
}

var init = function() {
  startButton = document.querySelector("#start");
  if(!startButton) {
    setTimeout(init, 100);
    return;
  }

  generatePage();
  state.migrate();
  state.load();
  state.setup();
  makeSentence();
  startButton.addEventListener("click", makeSentence);
  document.getElementById("reset").addEventListener("click", reset);
};

window.onload = init();
