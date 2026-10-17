//// Application entry point for the GAS Git Server Web UI (`web/`).
////
//// Starts the Lustre MVU application defined in `gas_git_ui/page`.

import gas_git_ui/page
import lustre

pub fn main() {
  let app = lustre.application(page.init, page.update, page.view)
  let assert Ok(_) = lustre.start(app, "#app", Nil)
  Nil
}
