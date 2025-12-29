import userApi from "./httpClient";

export interface InboxMessage {
    id: number;
    title: string;
    content: string;
    created_at: string;
    is_read: boolean;
    read_at?: string;
}

export const fetchMyInbox = async (): Promise<InboxMessage[]> => {
    const response = await userApi.get<InboxMessage[]>("/api/crm/messages/inbox");
    return response.data;
};

export const markMessageAsRead = async (messageId: number): Promise<void> => {
    await userApi.post(`/api/crm/messages/${messageId}/read`, {});
};
