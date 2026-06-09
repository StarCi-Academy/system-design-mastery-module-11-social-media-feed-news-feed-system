/**
 * Kiểu dùng chung trong lesson (response, params).
 * (EN: Shared lesson types (responses, params).)
 */
export interface ApiMessageResponse {
    /**
     * Trạng thái xử lý.
     * (EN: Processing status.)
     */
    status: string
    /**
     * Thông báo mô tả kết quả.
     * (EN: Human-readable result message.)
     */
    message?: string
}
