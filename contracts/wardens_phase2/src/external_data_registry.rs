use odra::prelude::*;

#[odra::module]
pub struct ExternalDataRegistry {
    companies: Mapping<String, bool>,
    invoices_paid: Mapping<String, bool>,
    invoices_pledged: Mapping<String, String>,
}

#[odra::module]
impl ExternalDataRegistry {
    pub fn init(&mut self) {
        // Initialize the external data registry
    }

    pub fn register_company(&mut self, name: String, valid: bool) {
        self.companies.set(&name, valid);
    }

    pub fn is_company_valid(&self, name: String) -> bool {
        self.companies.get(&name).unwrap_or(false)
    }

    pub fn register_invoice(&mut self, invoice_number: String, paid: bool, pledged_to_asset_id: Option<String>) {
        self.invoices_paid.set(&invoice_number, paid);
        if let Some(asset_id) = pledged_to_asset_id {
            self.invoices_pledged.set(&invoice_number, asset_id);
        }
    }

    pub fn is_invoice_paid(&self, invoice_number: String) -> bool {
        self.invoices_paid.get(&invoice_number).unwrap_or(false)
    }

    pub fn get_invoice_pledged_asset(&self, invoice_number: String) -> Option<String> {
        self.invoices_pledged.get(&invoice_number)
    }
}
