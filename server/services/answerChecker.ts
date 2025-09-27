export class AnswerChecker {
  private words: Record<string,string> = {
    zero:'0', one:'1', two:'2', three:'3', four:'4', five:'5',
    six:'6', seven:'7', eight:'8', nine:'9', ten:'10', eleven:'11',
    twelve:'12', thirteen:'13', fourteen:'14', fifteen:'15',
    sixteen:'16', seventeen:'17', eighteen:'18', nineteen:'19',
    twenty:'20', thirty:'30', forty:'40', fifty:'50', sixty:'60',
    seventy:'70', eighty:'80', ninety:'90', hundred:'100', thousand:'1000'
  };

  normalize(s:string):string {
    let t = s.toLowerCase().trim();
    Object.entries(this.words).forEach(([w,d]) => t = t.replace(new RegExp(`\\b${w}\\b`,'g'), d));
    t = t.replace(/[^a-z0-9\s+\-*/()=.]/g, '').replace(/\s+/g,' ').trim();
    return t;
  }

  safeEval(expr:string):number|null {
    try {
      const m = this.normalize(expr).match(/^(\d+(?:\.\d+)?)\s*([\+\-\*/])\s*(\d+(?:\.\d+)?)$/);
      if (!m) return null;
      const [,a,op,b] = m;
      const A = parseFloat(a), B = parseFloat(b);
      if (isNaN(A)||isNaN(B)) return null;
      return op==='+'?A+B:op==='-'?A-B:op==='*'?A*B:B!==0?A/B:null;
    } catch { return null; }
  }

  lev(a:string,b:string):number {
    const dp = Array(b.length+1).fill(0).map((_,i)=>[i]);
    for(let j=0;j<=a.length;j++) dp[0][j]=j;
    for(let i=1;i<=b.length;i++) for(let j=1;j<=a.length;j++)
      dp[i][j] = b[i-1]===a[j-1] ? dp[i-1][j-1] : Math.min(dp[i-1][j-1], dp[i][j-1], dp[i-1][j]) + 1;
    return dp[b.length][a.length];
  }

  checkAnswer(expected:string, user:string, type:'math'|'mcq'|'short'|'auto'='auto'){
    let t = type;
    const u = this.normalize(user);
    const e = this.normalize(expected);

    if (t==='auto'){
      if (/^[a-d]$/.test(e) || /option [a-d]/.test(e)) t='mcq';
      else if (/^[\d\s+\-*/()=.]+$/.test(e)) t='math';
      else t='short';
    }

    if (t==='math'){
      if (u===e) return {ok:true, msg:"Excellent! That's correct."};
      const U = this.safeEval(u) ?? parseFloat(u);
      const E = this.safeEval(e) ?? parseFloat(e);
      if (!isNaN(U) && !isNaN(E) && Math.abs(U-E)<=1e-2) return {ok:true, msg:"Perfect! You got it right."};
      return {ok:false, msg:`Not quite. The answer is ${expected}. Let me show you how to solve it.`};
    }

    if (t==='mcq'){
      const letter = e.match(/[a-d]/)?.[0]; if (!letter) return {ok:false,msg:"I couldn't read that answer."};
      const idx = letter.charCodeAt(0)-96; // a=1
      const accepts = [letter, `option ${letter}`, `answer ${letter}`, String(idx)];
      const ok = accepts.some(a => u===a || u.includes(a));
      return ok ? {ok:true,msg:"Great job! That's the right answer."}
                : {ok:false,msg:`Actually, the correct answer is ${letter.toUpperCase()}. Let's review why.`};
    }

    // short text (fuzzy)
    if (u===e) return {ok:true,msg:"Exactly right! Well done."};
    const d = this.lev(u,e), max = e.length<=5?1:2;
    if (d<=max) return {ok:true,msg:"Good! That's correct."};
    if (u.includes(e) || e.includes(u)) return {ok:true,msg:"Yes, that's right!"};
    return {ok:false,msg:`Close try! The answer we're looking for is "${expected}".`};
  }
}

export const answerChecker = new AnswerChecker();