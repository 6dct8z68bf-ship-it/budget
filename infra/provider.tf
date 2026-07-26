terraform {
  required_version = ">= 1.5"
  required_providers {
    oci = {
      source  = "oracle/oci"
      version = "~> 8.20"
    }
  }
}

# ──────────────────────────────────────────────
# Oracle Cloud Infrastructure Provider
# ──────────────────────────────────────────────
# 以下所有 "<填這裡>" 的欄位請你自行修改成對應的值
# 不要在 git 上提交真實的 API 金鑰與 OCID
#
# 認證方式：OCI API 金鑰
# 步驟：
#   1. 產金鑰對
#      openssl genrsa -out ~/.oci/oci_api_key.pem 4096
#      openssl rsa -pubout -in ~/.oci/oci_api_key.pem -out ~/.oci/oci_api_key_public.pem
#   2. OCI Console → 右上角 User (人頭) → User Settings → API Keys → Add API Key
#      貼上 oci_api_key_public.pem 的內容
#   3. 記下畫面顯示的 Fingerprint
#   4. 以下變數填對應的值

provider "oci" {
  # ── OCI 區域 ──
  # 可用區域列表：
  #   ap-sydney-1
  #   ap-melbourne-1
  #   ap-seoul-1
  #   ap-tokyo-1
  #   ap-mumbai-1
  #   ap-singapore-1
  #   us-ashburn-1
  #   us-phoenix-1
  #   eu-frankfurt-1
  #   eu-london-1
  region = var.region # 預設 ap-sydney-1，可在 terraform.tfvars 修改

  # ── 使用者 OCID ──
  # 在哪裡找：OCI Console → 右上角 User (人頭) → User Settings
  #            頁面中間 "OCID" 欄位，點 Copy
  # 範例：   ocid1.user.oc1..aaaaaaaaxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
  user_ocid = var.user_ocid

  # ── 租戶 (Tenancy) OCID ──
  # 在哪裡找：OCI Console → 右上角 User (人頭) → Tenancy: <你的租戶名>
  #            點進去 → 頁面 "OCID" 欄位，點 Copy
  # 範例：   ocid1.tenancy.oc1..aaaaaaaaxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
  tenancy_ocid = var.tenancy_ocid

  # ── API 金鑰 Fingerprint ──
  # 在哪裡找：OCI Console → User Settings → API Keys → 你剛新增的金鑰
  #            表格中 "Fingerprint" 欄位，點 Copy
  # 範例：   12:34:56:78:90:ab:cd:ef:12:34:56:78:90:ab:cd:ef
  fingerprint = var.api_key_fingerprint

  # ── 私鑰檔案路徑 ──
  # 指向剛才產生的 PEM 檔案
  # 範例：   ~/.oci/oci_api_key.pem
  private_key_path = var.private_key_path
}
