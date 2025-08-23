// このファイルは、WITファイルで定義された 'builder' インターフェースの
// 具体的な実装を提供します。

export const ExampleList = class ExampleList {
    _value = '';

    constructor() {
      console.log("JS Host: StringBuilder instance created.");
    }

    append(s) {
      this._value += s;
      // 'this' を返すことは、メソッドチェーンを可能にするための
      // JavaScriptにおける慣用的な方法です。
      return this;
    }

    toString() {
      return this._value;
    }

    // この特別なメソッドは、jcoのリソース管理ポリフィルによって使用されます。
    // ゲストがリソースハンドルを破棄（drop）した際に呼び出されます。
  }
